import { ConfigStore } from "../src/config/config-store.js";
import { it, expect, afterEach, describe } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createServer } from "../src/mcp/server.js";
import { createService } from "../src/hpm-sdk-service.js";
import { newConfig } from "../src/config/config.js";
import type { ConfigJSON } from "../src/config/config-type.js";
import { createSdkFixture, fakeRunner, writeFile } from "./fixtures.js";
import * as schemas from "../src/mcp/schemas.js";
const roots: string[] = [];
const closers: (() => Promise<void>)[] = [];
const old = process.env.HPMSDKCTL_CONFIG;
afterEach(async () => {
  for (const close of closers.splice(0)) {
    await close();
  }
  if (old === undefined) {
    delete process.env.HPMSDKCTL_CONFIG;
  } else {
    process.env.HPMSDKCTL_CONFIG = old;
  }
  for (const rootDirectory of roots.splice(0)) {
    fs.rmSync(rootDirectory, { recursive: true, force: true });
  }
});

async function setup(valid = true, code = 0) {
  const sdkFixture = createSdkFixture();
  roots.push(sdkFixture.rootDirectory);
  process.env.HPMSDKCTL_CONFIG = path.join(sdkFixture.rootDirectory, "config.json");
  new ConfigStore().save(valid ? sdkFixture.configuration : newConfig());
  const fake = fakeRunner(code);
  const server = createServer(createService({ runner: fake.runner }));
  const client = new Client({ name: "test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(clientTransport);
  await client.connect(serverTransport);
  closers.push(async () => {
    await client.close();
    await server.close();
  });
  return { sdkFixture, fake, client };
}

const structured = (result: Awaited<ReturnType<Client["callTool"]>>) =>
  result.structuredContent as Record<string, unknown>;

/** Exercises actual wire responses against the same schemas used for registration. */
const outputCases = [
  { name: "config.get", schema: schemas.configGetOutputSchema },
  { name: "config.set", schema: schemas.savedSchema },
  { name: "config.unset", schema: schemas.savedSchema },
  { name: "config.init", schema: schemas.savedSchema },
  { name: "config.list", schema: schemas.configListOutputSchema },
  { name: "config.check", schema: schemas.configDoctorOutputSchema },
  { name: "build.list_options", schema: schemas.buildOptionsOutputSchema },
  { name: "openocd.list_configs", schema: schemas.openOCDConfigOutputSchema },
  { name: "build.generate", schema: schemas.processOutputSchema },
  { name: "build.compile", schema: schemas.processOutputSchema },
  { name: "openocd.flash", schema: schemas.processOutputSchema },
  { name: "openocd.start_gdb_server", schema: schemas.processOutputSchema },
  { name: "project.localize_sdk", schema: schemas.processOutputSchema },
  { name: "project.unlocalize_sdk", schema: schemas.unlocalizeOutputSchema },
];

it.each(outputCases)(
  "$name declares outputSchema and returns schema-valid success and failure",
  async ({ name, schema }) => {
    const { client, sdkFixture } = await setup();
    const buildDirectory = path.join(sdkFixture.rootDirectory, "schema-build");
    writeFile(path.join(buildDirectory, "build.ninja"));
    writeFile(
      path.join(sdkFixture.applicationDirectory, "CMakeLists.txt.localized.bak"),
      "original",
    );
    const inputs: Record<string, Record<string, unknown>> = {
      "config.get": { key: "hpm_sdk" },
      "config.set": { key: "env.CUSTOM", value: "value" },
      "config.unset": { key: "env.CUSTOM" },
      "config.init": {
        hpm_sdk: sdkFixture.sdkDirectory,
        ...sdkFixture.configuration.tools,
        toolchain: sdkFixture.configuration.env.GNURISCV_TOOLCHAIN_PATH,
      },
      "config.list": {},
      "config.check": {},
      "build.list_options": { sample: "hello_world" },
      "openocd.list_configs": { board: "hpm6750evkmini" },
      "build.generate": {
        sample: "hello_world",
        board: "hpm6750evkmini",
        hpm_build_type: "ram",
        cmake_build_type: "debug",
      },
      "build.compile": { build_dir: buildDirectory },
      "project.localize_sdk": { build_dir: buildDirectory },
      "openocd.flash": {
        probe: "ft2232",
        soc: "hpm6750-single-core",
        board: "hpm6750evkmini",
        file: "firmware.elf",
      },
      "openocd.start_gdb_server": {
        probe: "ft2232",
        soc: "hpm6750-single-core",
        board: "hpm6750evkmini",
      },
      "project.unlocalize_sdk": { localized_dir: sdkFixture.applicationDirectory },
    };
    expect(
      (await client.listTools()).tools.find((tool) => tool.name === name)?.outputSchema,
    ).toBeDefined();
    const success = await client.callTool({ name, arguments: inputs[name] });
    expect(schema.parse(success.structuredContent).ok).toBe(true);
    expect(success.isError).toBe(false);
    writeFile(process.env.HPMSDKCTL_CONFIG!, "{");
    const failure = await client.callTool({
      name,
      arguments:
        name === "config.init"
          ? { sdk_env: path.join(sdkFixture.rootDirectory, "missing-sdk-env") }
          : inputs[name],
    });
    expect(schema.parse(failure.structuredContent).ok).toBe(false);
    expect(failure.isError).toBe(true);
    expect(structured(failure).error).toEqual(expect.any(String));
  },
);

it.each(["build.compile", "project.localize_sdk", "openocd.flash", "openocd.start_gdb_server"])(
  "%s returns schema-valid nonzero process results",
  async (name) => {
    const { client, sdkFixture } = await setup(true, 7);
    const buildDirectory = path.join(sdkFixture.rootDirectory, "nonzero-build");
    writeFile(path.join(buildDirectory, "build.ninja"));
    const input =
      name === "build.compile" || name === "project.localize_sdk"
        ? { build_dir: buildDirectory }
        : {
            probe: "ft2232",
            soc: "hpm6750-single-core",
            board: "hpm6750evkmini",
            file: "firmware.elf",
          };
    const result = await client.callTool({ name, arguments: input });
    expect(schemas.processOutputSchema.parse(result.structuredContent)).toMatchObject({
      ok: false,
      exit_code: 7,
      stdout: "out",
      stderr: "err",
    });
    expect(result.isError).toBe(true);
  },
);

it.each(["build.list_options", "openocd.list_configs"])(
  "%s returns structured precondition failures",
  async (name) => {
    const { client } = await setup(false);
    const result = await client.callTool({
      name,
      arguments: name === "build.list_options" ? { sample: "missing" } : { board: "missing" },
    });
    expect(result.isError).toBe(true);
    expect(structured(result)).toMatchObject({
      ok: false,
      error: expect.any(String),
      boards: null,
    });
  },
);
describe("MCP wire contracts", () => {
  it.each(["env.CUSTOM", "python", "hpm_sdk"])(
    "unset clears and persists key or alias %s without running tools",
    async (key) => {
      const { client, fake, sdkFixture } = await setup();
      sdkFixture.configuration.set("env.CUSTOM", "value");
      new ConfigStore().save(sdkFixture.configuration);
      const result = await client.callTool({ name: "config.unset", arguments: { key } });
      const output = schemas.savedSchema.parse(result.structuredContent);
      expect(result.isError).toBe(false);
      expect(output.ok).toBe(true);
      expect(output.path).toBe(process.env.HPMSDKCTL_CONFIG);
      expect(new ConfigStore().load().get(key)).toBe("");
      if (key === "hpm_sdk") {
        expect(output.config?.env).not.toHaveProperty("HPM_SDK_BASE");
      }
      expect(fake.calls).toEqual([]);
    },
  );

  it("unset rejects unknown keys without changing persisted configuration", async () => {
    const { client, sdkFixture } = await setup();
    const original = fs.readFileSync(process.env.HPMSDKCTL_CONFIG!, "utf8");
    const result = await client.callTool({
      name: "config.unset",
      arguments: { key: "unknown" },
    });
    expect(schemas.savedSchema.parse(result.structuredContent)).toMatchObject({
      ok: false,
      path: "",
      config: null,
      error: expect.stringContaining("unknown config key"),
    });
    expect(result.isError).toBe(true);
    expect(fs.readFileSync(process.env.HPMSDKCTL_CONFIG!, "utf8")).toBe(original);
    expect(new ConfigStore().load()).toEqual(sdkFixture.configuration);
  });

  it("registers exactly 14 tools and exposes instructions", async () => {
    const { client } = await setup();
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
      "build.compile",
      "build.generate",
      "build.list_options",
      "config.check",
      "config.get",
      "config.init",
      "config.list",
      "config.set",
      "config.unset",
      "openocd.flash",
      "openocd.list_configs",
      "openocd.start_gdb_server",
      "project.localize_sdk",
      "project.unlocalize_sdk",
    ]);
    expect(client.getInstructions()).toContain("hpmsdkctl MCP Server");
    const tools = (await client.listTools()).tools;
    for (const file of ["README.md", "README.zh-CN.md"]) {
      const document = fs.readFileSync(file, "utf8");
      for (const tool of tools) {
        expect(document).toContain(`\`${tool.name}\``);
      }
    }
    expect(client.getServerVersion()).toMatchObject({
      name: "hpmsdkctl",
      version: JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"))
        .version,
    });
  });
  it("get/set/list persist config and return structured results", async () => {
    const { client } = await setup();
    expect(
      structured(
        await client.callTool({
          name: "config.set",
          arguments: { key: "env.CUSTOM", value: "yes" },
        }),
      ).ok,
    ).toBe(true);
    expect(
      structured(
        await client.callTool({
          name: "config.get",
          arguments: { key: "env.CUSTOM" },
        }),
      ),
    ).toEqual({ ok: true, key: "env.CUSTOM", value: "yes" });
    expect(
      (
        structured(await client.callTool({ name: "config.list", arguments: {} }))
          .config as ConfigJSON
      ).env.CUSTOM,
    ).toBe("yes");
  });
  it("get errors return ok=false and protocol isError", async () => {
    const { client } = await setup();
    const result = await client.callTool({
      name: "config.get",
      arguments: { key: "unknown" },
    });
    expect(structured(result)).toMatchObject({
      ok: false,
      key: "unknown",
      value: "",
    });
    expect(result.isError).toBe(true);
  });
  it("config check reports structured empty config failure", async () => {
    const { client } = await setup(false);
    expect(
      structured(await client.callTool({ name: "config.check", arguments: {} })),
    ).toMatchObject({ ok: false, error: "config check found errors" });
  });
  it.each([
    "build.generate",
    "build.compile",
    "openocd.flash",
    "openocd.start_gdb_server",
    "project.localize_sdk",
  ])("%s validation failures are structured errors without invented exit codes", async (name) => {
    const { client } = await setup(false);
    const invalidInputs: Record<string, Record<string, string>> = {
      "build.generate": { board: "", hpm_build_type: "", cmake_build_type: "" },
      "build.compile": { build_dir: "" },
      "project.localize_sdk": { build_dir: "" },
      "openocd.flash": { probe: "", soc: "", board: "", file: "" },
      "openocd.start_gdb_server": { probe: "", soc: "", board: "" },
    };
    const input = invalidInputs[name];
    const result = await client.callTool({ name, arguments: input });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      exit_code: null,
      stdout: "",
      stderr: "",
    });
    expect(result.content[0]).toMatchObject({ type: "text" });
  });
  it.each([0, 5])("generate success/nonzero exit %s returns stdout then stderr", async (code) => {
    const { client, fake } = await setup(true, code);
    const result = await client.callTool({
      name: "build.generate",
      arguments: {
        sample: "hello_world",
        board: "hpm6750evkmini",
        hpm_build_type: "ram",
        cmake_build_type: "debug",
      },
    });
    expect(result.content).toEqual([{ type: "text", text: "out\nerr" }]);
    expect(result.isError).toBe(code !== 0);
    expect(result.structuredContent).toMatchObject({
      ok: code === 0,
      exit_code: code,
      stdout: "out",
      stderr: "err",
    });
    expect(fake.calls).toHaveLength(1);
  });
  it("generates with custom_board while board is omitted", async () => {
    const { client, fake, sdkFixture } = await setup();
    const customBoard = path.join(sdkFixture.rootDirectory, "custom-board");
    writeFile(path.join(customBoard, "CMakeLists.txt"));
    writeFile(path.join(customBoard, "custom-board.yaml"), "board: {soc: HPM6750}");
    const result = await client.callTool({
      name: "build.generate",
      arguments: {
        sample: "hello_world",
        custom_board: customBoard,
        hpm_build_type: "ram",
        cmake_build_type: "debug",
      },
    });
    expect(result.isError).toBe(false);
    expect(fake.calls[0].toolArguments).toContain("-DBOARD=custom-board");
  });
  it("rejects BIN flashing without an address as a structured business error", async () => {
    const { client, fake } = await setup();
    const result = await client.callTool({
      name: "openocd.flash",
      arguments: {
        probe: "ft2232",
        soc: "hpm6750-single-core",
        board: "hpm6750evkmini",
        file: "firmware.bin",
      },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: "address is required for BIN firmware",
      exit_code: null,
    });
    expect(fake.calls).toEqual([]);
  });
  it("init preserves explicit paths, defaults, invalid modes and import failure", async () => {
    const { client, sdkFixture: sdkFixture } = await setup();
    const input = {
      hpm_sdk: sdkFixture.sdkDirectory,
      cmake: sdkFixture.configuration.tools.cmake,
      ninja: sdkFixture.configuration.tools.ninja,
      python: sdkFixture.configuration.tools.python,
      toolchain: sdkFixture.configuration.env.GNURISCV_TOOLCHAIN_PATH,
    };
    expect(structured(await client.callTool({ name: "config.init", arguments: input })).ok).toBe(
      true,
    );
    expect(
      structured(
        await client.callTool({
          name: "config.init",
          arguments: { sdk_env: "bad", cmake: "x" },
        }),
      ).ok,
    ).toBe(false);
    expect(structured(await client.callTool({ name: "config.init", arguments: {} })).ok).toBe(
      false,
    );
    expect(
      structured(
        await client.callTool({
          name: "config.init",
          arguments: { sdk_env: "missing" },
        }),
      ).error,
    ).toContain("cmd_params.yaml");
  });
  it("discovery and unlocalize use structured output", async () => {
    const { client, sdkFixture: sdkFixture } = await setup();
    expect(
      structured(
        await client.callTool({
          name: "build.list_options",
          arguments: { sample: "hello_world" },
        }),
      ).app_dir,
    ).toBe(sdkFixture.applicationDirectory);
    expect(
      structured(
        await client.callTool({
          name: "openocd.list_configs",
          arguments: { board: "hpm6750evkmini" },
        }),
      ).default,
    ).toMatchObject({ probe: "ft2232" });
    writeFile(
      path.join(sdkFixture.applicationDirectory, "CMakeLists.txt.localized.bak"),
      "original",
    );
    expect(
      structured(
        await client.callTool({
          name: "project.unlocalize_sdk",
          arguments: { localized_dir: sdkFixture.applicationDirectory },
        }),
      ),
    ).toEqual({ localized_dir: sdkFixture.applicationDirectory, ok: true });
  });
  it("compiled package starts and answers legacy MCP over stdio without stdout noise", async () => {
    const sdkFixture = createSdkFixture();
    roots.push(sdkFixture.rootDirectory);
    const file = path.join(sdkFixture.rootDirectory, "config.json");
    new ConfigStore(file).save(sdkFixture.configuration);
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [path.resolve("dist/main.js"), "mcp"],
      env: { ...process.env, HPMSDKCTL_CONFIG: file } as Record<string, string>,
      stderr: "pipe",
    });
    const client = new Client({ name: "stdio-test", version: "1" });
    closers.push(() => client.close());
    await client.connect(transport);
    expect(client.getServerVersion()?.version).toBe(
      JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version,
    );
    expect((await client.listTools()).tools).toHaveLength(14);
    expect(
      structured(
        await client.callTool({
          name: "config.get",
          arguments: { key: "hpm_sdk" },
        }),
      ).value,
    ).toBe(sdkFixture.sdkDirectory);
  });
});
