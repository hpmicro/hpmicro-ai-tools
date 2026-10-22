import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createCli } from "../src/cli/cli.js";
import { CliHandlers } from "../src/cli/cli-handlers.js";
import { ConfigStore } from "../src/config/config-store.js";
import { ConfigOperationError, HpmSdkService, createService } from "../src/hpm-sdk-service.js";
import { createServer } from "../src/mcp/server.js";
import { McpHandlers } from "../src/mcp/mcp-handlers.js";
import { createSdkFixture, fakeRunner, writeFile } from "./fixtures.js";
import {
  buildOptionsOutputSchema,
  openOCDConfigOutputSchema,
  processOutputSchema,
} from "../src/mcp/schemas.js";
import { Config } from "../src/config/config.js";
const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

/** Supplies isolated configuration and an observable process dependency. */
function setup(exitCode = 0) {
  const fixture = createSdkFixture();
  temporaryDirectories.push(fixture.rootDirectory);
  const store = new ConfigStore(path.join(fixture.rootDirectory, "config.json"));
  store.save(fixture.configuration);
  const processStub = fakeRunner(exitCode);
  const service = new HpmSdkService(store, processStub.runner);
  return { fixture, store, processStub, service };
}

it("returns detached data snapshots rather than configuration instances", async () => {
  const { fixture, service } = setup();
  const snapshot = service.readConfig();
  expect(snapshot).not.toBeInstanceOf(Config);
  snapshot.tools.ninja = "changed";
  snapshot.env.HPM_SDK_BASE = "changed";
  expect(service.readConfig().tools.ninja).toBe(fixture.configuration.tools.ninja);
  expect(service.readConfig().env.HPM_SDK_BASE).toBe(fixture.sdkDirectory);
  const saved = await service.setConfigValue("env.CUSTOM", "original");
  expect(saved.configuration).not.toBeInstanceOf(Config);
  saved.configuration.env.CUSTOM = "changed";
  expect(service.getConfigValue("env.CUSTOM")).toBe("original");
  const json = fixture.configuration.toJSON();
  json.env.HPM_SDK_BASE = "changed";
  expect(fixture.configuration.env.HPM_SDK_BASE).toBe(fixture.sdkDirectory);
});

it("applies identical initialization and version validation through CLI and MCP", async () => {
  const { fixture, service, processStub } = setup();
  const options = {
    hpmSdk: fixture.sdkDirectory,
    ...fixture.configuration.tools,
    toolchain: fixture.configuration.env.GNURISCV_TOOLCHAIN_PATH,
  };
  await new CliHandlers(service).initialize(options);
  const cliCalls = processStub.calls.splice(0);
  const response = await new McpHandlers(service).initialize({
    hpm_sdk: options.hpmSdk,
    cmake: options.cmake,
    ninja: options.ninja,
    python: options.python,
    openocd: options.openocd,
    toolchain: options.toolchain,
  });
  expect(response.isError).toBe(false);
  expect(processStub.calls).toEqual(cliCalls);
  expect(cliCalls).toHaveLength(5);
  expect(cliCalls.every((call) => call.toolArguments.join() === "--version")).toBe(true);
});

it("does not save configuration when initialization version validation fails", async () => {
  const { fixture, store, service } = setup(7);
  const response = await new McpHandlers(service).initialize({
    hpm_sdk: fixture.sdkDirectory,
    ...fixture.configuration.tools,
    toolchain: fixture.configuration.env.GNURISCV_TOOLCHAIN_PATH,
  });
  expect(response.isError).toBe(true);
  expect(response.structuredContent.error).toContain("exited with code 7");
  expect(store.load()).toEqual(fixture.configuration);
});

it.each(["spawn failed", "operation aborted"])(
  "returns typed process failure for %s",
  async (message) => {
    const { service } = setup();
    vi.spyOn(service, "compile").mockRejectedValue(new Error(message));
    const response = await new McpHandlers(service).compile(
      { build_dir: "build" },
      new AbortController().signal,
    );
    expect(processOutputSchema.parse(response.structuredContent)).toEqual({
      ok: false,
      error: message,
      exit_code: null,
      stdout: "",
      stderr: "",
    });
    expect(response.isError).toBe(true);
  },
);

it("converts every MCP generation field to internal camelCase", async () => {
  const { service } = setup();
  const generate = vi.spyOn(service, "generate").mockResolvedValue({
    command: [],
    exitCode: 0,
    stdout: "",
    stderr: "",
    ok: true,
  });
  const signal = new AbortController().signal;
  await new McpHandlers(service).generate(
    {
      sample: "sample",
      app_dir: "app",
      board: "board",
      custom_board: "custom",
      hpm_build_type: "ram",
      cmake_build_type: "debug",
      custom_gcc_linker_file: "linker.ld",
      build_dir: "build",
      clean: true,
    },
    signal,
  );
  expect(generate).toHaveBeenCalledWith(
    {
      sample: "sample",
      appDir: "app",
      board: "board",
      customBoard: "custom",
      hpmBuildType: "ram",
      cmakeBuildType: "debug",
      customGccLinkerFile: "linker.ld",
      buildDir: "build",
      clean: true,
    },
    { signal },
  );
});

it("keeps discovery results camelCase internally and serializes MCP responses", async () => {
  const { service } = setup();
  const handlers = new McpHandlers(service);
  const internal = service.getBuildOptions("hello_world");
  expect(internal).toHaveProperty("appDir");
  expect(internal).not.toHaveProperty("app_dir");
  expect(internal.boards![0]).toHaveProperty("buildTypes");
  expect(internal.boards![0].buildTypes[0]).toHaveProperty("hpmBuildType");
  const response = await handlers.getBuildOptions({ sample: "hello_world" });
  expect(buildOptionsOutputSchema.safeParse(response.structuredContent).success).toBe(true);
  expect(response.structuredContent).not.toHaveProperty("appDir");
  expect(service.getOpenOCDConfig("hpm6750evkmini")).toHaveProperty("boardName");
  const openocd = await handlers.getOpenOCDConfig({ board: "hpm6750evkmini" });
  expect(openOCDConfigOutputSchema.safeParse(openocd.structuredContent).success).toBe(true);
  expect(openocd.structuredContent).not.toHaveProperty("boardName");
});

it("loads updated tool paths for each operation instead of caching configuration", async () => {
  const { fixture, store, processStub, service } = setup();
  const buildDirectory = path.join(fixture.rootDirectory, "build");
  writeFile(path.join(buildDirectory, "build.ninja"));
  await service.compile(buildDirectory);
  const originalNinja = fixture.configuration.tools.ninja;
  fixture.configuration.tools.ninja = writeFile(path.join(fixture.rootDirectory, "new-ninja.exe"));
  store.save(fixture.configuration);
  await service.compile(buildDirectory);
  expect(processStub.calls.map((call) => call.executablePath)).toEqual([
    originalNinja,
    fixture.configuration.tools.ninja,
  ]);
});
it("keeps failed setting validation out of the persisted configuration", async () => {
  const { fixture, store, service } = setup(1);
  const replacement = writeFile(path.join(fixture.rootDirectory, "replacement.exe"));
  const failure = await service
    .setConfigValue("tools.ninja", replacement)
    .catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ConfigOperationError);
  expect(failure).toMatchObject({
    configuration: { tools: { ninja: replacement } },
  });
  expect(store.load().tools.ninja).toBe(fixture.configuration.tools.ninja);
});
it("composes CLI and MCP without creating a configuration file or running tools", () => {
  const { fixture, processStub } = setup();
  const configPath = path.join(fixture.rootDirectory, "not-created", "config.json");
  const service = createService({ configPath, runner: processStub.runner });
  createCli(service);
  createServer(service);
  expect(fs.existsSync(configPath)).toBe(false);
  expect(processStub.calls).toEqual([]);
});
it("allows CLI commands to use the injected configuration and process dependency", async () => {
  const { fixture, service, processStub } = setup();
  const buildDirectory = path.join(fixture.rootDirectory, "build");
  writeFile(path.join(buildDirectory, "build.ninja"));
  await createCli(service).parseAsync(["build", "compile", "--build-dir", buildDirectory], {
    from: "user",
  });
  expect(processStub.calls).toHaveLength(1);
  expect(processStub.calls[0]).toMatchObject({
    executablePath: fixture.configuration.tools.ninja,
    executionOptions: { cwd: buildDirectory },
  });
});
it("retains the original import error without writing configuration", async () => {
  const { fixture, store, service } = setup();
  const failure = await service
    .initialize({ sdkEnv: path.join(fixture.rootDirectory, "missing") })
    .catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ConfigOperationError);
  expect(failure).toMatchObject({ configuration: null, cause: { code: "ENOENT" } });
  expect((failure as Error).message).toContain("cmd_params.yaml");
  expect(failure).not.toHaveProperty("stage");
  expect(store.load()).toEqual(fixture.configuration);
});

it("executes a named handler independently of Commander registration", async () => {
  const { fixture, service, processStub } = setup();
  const buildDirectory = path.join(fixture.rootDirectory, "handler-build");
  writeFile(path.join(buildDirectory, "build.ninja"));
  await new CliHandlers(service).compile({ buildDir: buildDirectory });
  expect(processStub.calls).toHaveLength(1);
  expect(processStub.calls[0]).toMatchObject({
    executablePath: fixture.configuration.tools.ninja,
    executionOptions: { cwd: buildDirectory, stdout: process.stderr, stderr: process.stderr },
  });
});

it("validates CLI discovery arguments before calling business operations", () => {
  const { service, processStub } = setup();
  const handlers = new CliHandlers(service);
  expect(() => handlers.buildOptions({})).toThrow("--sample or --app-dir is required");
  expect(() => handlers.openOCDConfig({})).toThrow("--board is required");
  expect(processStub.calls).toEqual([]);
});

it("executes an MCP handler independently and propagates the cancellation signal", async () => {
  const { fixture, service, processStub } = setup();
  const buildDirectory = path.join(fixture.rootDirectory, "mcp-handler-build");
  writeFile(path.join(buildDirectory, "build.ninja"));
  const controller = new AbortController();
  const result = await new McpHandlers(service).compile(
    { build_dir: buildDirectory },
    controller.signal,
  );
  expect(result.isError).toBe(false);
  expect(processStub.calls[0].executionOptions.signal).toBe(controller.signal);
});

it("formats failed MCP configuration writes without persisting invalid settings", async () => {
  const { fixture, service, store } = setup(1);
  const replacement = writeFile(path.join(fixture.rootDirectory, "invalid-ninja.exe"));
  const result = await new McpHandlers(service).setConfigValue({
    key: "tools.ninja",
    value: replacement,
  });
  expect(result.structuredContent).toMatchObject({
    ok: false,
    path: "",
    config: { tools: { ninja: replacement } },
  });
  expect(store.load().tools.ninja).toBe(fixture.configuration.tools.ninja);
});
