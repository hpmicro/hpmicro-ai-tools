import { ConfigStore } from "../src/config/config-store.js";
import { afterEach, describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { createSdkFixture, writeFile } from "./fixtures.js";
const referenceExecutable = process.env.HPMSDKCTL_GO_REFERENCE;
const fakeToolExecutable = process.env.HPMSDKCTL_FAKE_TOOL;
const temporaryDirectories: string[] = [];
const referenceToolNames: Record<string, string> = {
  "config.get": "hpm_config_get",
  "config.set": "hpm_config_set",
  "config.init": "hpm_config_init",
  "config.list": "hpm_config_list",
  "config.check": "hpm_config_doctor",
  "build.list_options": "hpm_build_options",
  "openocd.list_configs": "hpm_openocd_config",
  "build.generate": "hpm_generate",
  "build.compile": "hpm_compile",
  "openocd.flash": "hpm_flash",
  "openocd.start_gdb_server": "hpm_gdbserver",
  "project.localize_sdk": "hpm_localize",
  "project.unlocalize_sdk": "hpm_unlocalize",
};
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

/** Creates an isolated SDK whose tools report invocation arguments instead of accessing hardware. */
function setupComparison() {
  const sdkFixture = createSdkFixture();
  temporaryDirectories.push(sdkFixture.rootDirectory);
  for (const toolName of ["cmake", "ninja", "python", "openocd"] as const) {
    sdkFixture.configuration.tools[toolName] = fakeToolExecutable!;
  }
  const configFilePath = path.join(sdkFixture.rootDirectory, "config.json");
  new ConfigStore(configFilePath).save(sdkFixture.configuration);
  return { ...sdkFixture, configFilePath };
}

/** Translates the current grouped CLI into the legacy reference command layout. */
function referenceCliArguments(toolArguments: string[]): string[] {
  const [group, action, ...rest] = toolArguments;
  const command = `${group} ${action}`;
  switch (command) {
    case "config check":
      return ["config", "doctor", ...rest];
    case "build list-options":
      return ["build-options", ...rest];
    case "build generate":
      return ["generate", ...rest];
    case "build compile":
      return ["compile", ...rest];
    case "project localize-sdk":
      return ["localize", ...rest];
    case "project unlocalize-sdk":
      return ["unlocalize", ...rest];
    case "openocd list-configs":
      return ["openocd-config", ...rest];
    case "openocd flash":
      return ["flash", ...rest];
    case "openocd start-gdb-server":
      return ["gdbserver", ...rest];
    default:
      return toolArguments;
  }
}

/** Invokes either implementation with identical configuration and simulated tool exit status. */
function invokeCli(
  useReference: boolean,
  toolArguments: string[],
  configFilePath: string,
  toolExitCode = "0",
) {
  const executable = useReference ? referenceExecutable! : process.execPath;
  const invocationArguments = useReference
    ? referenceCliArguments(toolArguments)
    : [path.resolve("dist/main.js"), ...toolArguments];
  return spawnSync(executable, invocationArguments, {
    encoding: "utf8",
    env: {
      ...process.env,
      [useReference ? ["HPM", "CTL_CONFIG"].join("") : "HPMSDKCTL_CONFIG"]: configFilePath,
      HPMSDKCTL_FAKE_EXIT: toolExitCode,
    },
    windowsHide: true,
  });
}

/** Constructs representative operation arguments without embedding command selection in a ternary chain. */
function operationArguments(commandName: string, buildDirectory: string): string[] {
  switch (commandName) {
    case "generate":
      return [
        "build",
        "generate",
        "--sample",
        "hello_world",
        "--board",
        "hpm6750evkmini",
        "--hpm-build-type",
        "ram",
        "--cmake-build-type",
        "debug",
        "--build-dir",
        buildDirectory,
      ];
    case "compile":
      return ["build", "compile", "--build-dir", buildDirectory];
    case "localize":
      return ["project", "localize-sdk", "--build-dir", buildDirectory];
    default: {
      const toolArguments = [
        "openocd",
        commandName === "gdbserver" ? "start-gdb-server" : commandName,
        "--probe",
        "ft2232",
        "--soc",
        "hpm6750-single-core",
        "--board",
        "hpm6750evkmini",
      ];
      if (commandName === "flash") {
        toolArguments.push("--file", '中文 image".elf');
      }
      return toolArguments;
    }
  }
}

/** Compares stream content independently of nondeterministic stdout/stderr arrival order. */
function normalizeToolLog(output: string) {
  return { failure: output.includes("fake failure"), text: output.replace("fake failure", "") };
}

/** Parses structured JSON carried in a text content block. */
function parseResponseText(response: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const firstContent = response.content[0];
  if (firstContent?.type !== "text") {
    throw new Error("Expected a text content block");
  }
  return JSON.parse(firstContent.text);
}

describe.skipIf(!referenceExecutable || !fakeToolExecutable)(
  "Reference implementation comparison",
  () => {
    it.each([
      ["config", "list"],
      ["config", "get", "hpm_sdk"],
      ["config", "check"],
      ["build", "list-options", "--sample", "hello_world"],
      ["openocd", "list-configs", "--board", "hpm6750evkmini"],
    ])("CLI %s %s results match", (...toolArguments) => {
      const sdkFixture = setupComparison();
      const referenceResult = invokeCli(true, toolArguments, sdkFixture.configFilePath);
      const implementationResult = invokeCli(false, toolArguments, sdkFixture.configFilePath);
      expect(implementationResult.status).toBe(referenceResult.status);
      const returnsJSON =
        toolArguments[1] === "list" ||
        ["build list-options", "openocd list-configs"].includes(
          toolArguments.slice(0, 2).join(" "),
        );
      if (returnsJSON) {
        expect(JSON.parse(implementationResult.stdout)).toEqual(JSON.parse(referenceResult.stdout));
      } else {
        expect(implementationResult.stdout).toBe(referenceResult.stdout);
      }
    });
    it.each(["generate", "compile", "localize", "flash", "gdbserver"])(
      "CLI %s command, environment and working directory match",
      (commandName) => {
        const sdkFixture = setupComparison();
        const buildDirectory = path.join(sdkFixture.rootDirectory, "build");
        writeFile(path.join(buildDirectory, "build.ninja"));
        const toolArguments = operationArguments(commandName, buildDirectory);
        for (const toolExitCode of ["0", "7"]) {
          const referenceResult = invokeCli(
            true,
            toolArguments,
            sdkFixture.configFilePath,
            toolExitCode,
          );
          const implementationResult = invokeCli(
            false,
            toolArguments,
            sdkFixture.configFilePath,
            toolExitCode,
          );
          expect(implementationResult.status).toBe(referenceResult.status);
          expect(implementationResult.stdout).toBe(referenceResult.stdout);
          expect(normalizeToolLog(implementationResult.stderr)).toEqual(
            normalizeToolLog(referenceResult.stderr),
          );
        }
      },
    );
    it("CLI custom board and linker arguments match", () => {
      const sdkFixture = setupComparison();
      const boardDirectory = path.join(sdkFixture.rootDirectory, "custom");
      writeFile(path.join(boardDirectory, "CMakeLists.txt"));
      writeFile(path.join(boardDirectory, "custom.yaml"), "board: {soc: HPM6750}");
      const linkerFilePath = writeFile(path.join(sdkFixture.rootDirectory, "custom.ld"));
      const toolArguments = [
        "build",
        "generate",
        "--app-dir",
        sdkFixture.applicationDirectory,
        "--custom-board",
        boardDirectory,
        "--hpm-build-type",
        "ram",
        "--cmake-build-type",
        "debug",
        "--custom-gcc-linker",
        linkerFilePath,
      ];
      expect(invokeCli(false, toolArguments, sdkFixture.configFilePath).stderr).toBe(
        invokeCli(true, toolArguments, sdkFixture.configFilePath).stderr,
      );
    });
    it("CLI set/unset state matches", () => {
      const sdkFixture = setupComparison();
      for (const toolArguments of [
        ["config", "set", "env.CUSTOM", "value"],
        ["config", "unset", "env.CUSTOM"],
      ]) {
        const referenceResult = invokeCli(true, toolArguments, sdkFixture.configFilePath);
        const expectedConfiguration = JSON.parse(
          fs.readFileSync(sdkFixture.configFilePath, "utf8"),
        );
        const implementationResult = invokeCli(false, toolArguments, sdkFixture.configFilePath);
        expect(implementationResult.status).toBe(referenceResult.status);
        expect(JSON.parse(fs.readFileSync(sdkFixture.configFilePath, "utf8"))).toEqual(
          expectedConfiguration,
        );
      }
    });
    it("MCP preserves input requirements and accounts for changed response contracts", async () => {
      const sdkFixture = setupComparison();
      const clients: Client[] = [];
      try {
        for (const useReference of [true, false]) {
          const client = new Client({ name: "comparison", version: "1" });
          clients.push(client);
          await client.connect(
            new StdioClientTransport({
              command: useReference ? referenceExecutable! : process.execPath,
              args: useReference ? ["mcp"] : [path.resolve("dist/main.js"), "mcp"],
              env: {
                ...process.env,
                [useReference ? ["HPM", "CTL_CONFIG"].join("") : "HPMSDKCTL_CONFIG"]:
                  sdkFixture.configFilePath,
              } as Record<string, string>,
              stderr: "pipe",
            }),
          );
        }
        const toolLists = await Promise.all(clients.map((client) => client.listTools()));
        expect(
          toolLists[1].tools
            .map((tool) => referenceToolNames[tool.name])
            .filter(Boolean)
            .sort(),
        ).toEqual(toolLists[0].tools.map((tool) => tool.name).sort());
        for (const referenceTool of toolLists[0].tools) {
          const currentName = Object.entries(referenceToolNames).find(
            ([, referenceName]) => referenceName === referenceTool.name,
          )?.[0];
          const implementationTool = toolLists[1].tools.find((tool) => tool.name === currentName)!;
          expect([...(implementationTool.inputSchema.required || [])].sort()).toEqual(
            [...(referenceTool.inputSchema.required || [])].sort(),
          );
        }
        const toolCalls = [
          { name: "config.get", arguments: { key: "hpm_sdk" } },
          { name: "config.get", arguments: { key: "unknown" } },
          { name: "config.list", arguments: {} },
          { name: "config.check", arguments: {} },
          { name: "build.list_options", arguments: { sample: "hello_world" } },
          { name: "openocd.list_configs", arguments: { board: "hpm6750evkmini" } },
          {
            name: "build.generate",
            arguments: {
              sample: "hello_world",
              board: "hpm6750evkmini",
              hpm_build_type: "ram",
              cmake_build_type: "debug",
            },
          },
          {
            name: "openocd.flash",
            arguments: {
              probe: "ft2232",
              soc: "hpm6750-single-core",
              board: "hpm6750evkmini",
              file: "中文 image.elf",
              address: "0x80000400",
            },
          },
          { name: "config.init", arguments: { sdk_env: "missing" } },
        ];
        for (const toolCall of toolCalls) {
          const referenceResult = await clients[0].callTool({
            ...toolCall,
            name: referenceToolNames[toolCall.name],
          });
          const implementationResult = await clients[1].callTool(toolCall);
          expect(implementationResult.isError || false).toBe(
            (implementationResult.structuredContent as Record<string, unknown> | undefined)?.ok ===
              false,
          );
          // Import failures expose the original filesystem error rather than a generic input error.
          if (toolCall.name === "config.init") {
            expect(implementationResult.structuredContent).toMatchObject({
              ok: false,
              path: "",
              config: null,
              error: expect.stringContaining("cmd_params.yaml"),
            });
            expect(parseResponseText(implementationResult)).toEqual(
              implementationResult.structuredContent,
            );
            continue;
          }
          // New process responses preserve tool text and add typed structured outcomes.
          if (["build.generate", "openocd.flash"].includes(toolCall.name)) {
            expect(implementationResult.content).toEqual(referenceResult.content);
            expect(implementationResult.structuredContent).toMatchObject({
              ok: true,
              exit_code: 0,
            });
            continue;
          }
          // Discovery now includes operation status while preserving its successful payload.
          const referenceData = referenceResult.structuredContent as Record<string, unknown>;
          const expectedData = ["build.list_options", "openocd.list_configs"].includes(
            toolCall.name,
          )
            ? { ok: true, ...referenceData }
            : referenceData;
          expect(implementationResult.structuredContent).toEqual(expectedData);
          if (referenceResult.structuredContent) {
            expect(parseResponseText(implementationResult)).toEqual(expectedData);
          } else {
            expect(implementationResult.content).toEqual(referenceResult.content);
          }
        }
      } finally {
        for (const client of clients) {
          await client.close();
        }
      }
    }, 30000);
  },
);
