import { ConfigStore } from "../src/config/config-store.js";
import { it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createSdkFixture } from "./fixtures.js";
import { createCli } from "../src/cli/cli.js";
import { version } from "../src/version.js";
const roots: string[] = [];
afterEach(() => {
  for (const rootDirectory of roots.splice(0)) {
    fs.rmSync(rootDirectory, { recursive: true, force: true });
  }
});
const invoke = (toolArguments: string[], configFilePath: string) =>
  spawnSync(process.execPath, [path.resolve("dist/main.js"), ...toolArguments], {
    encoding: "utf8",
    env: { ...process.env, HPMSDKCTL_CONFIG: configFilePath },
    windowsHide: true,
  });

function leafCommands(
  command = createCli(),
  prefix: string[] = [],
): { name: string; command: typeof command }[] {
  return command.commands.flatMap((subcommand) => {
    const commandPath = [...prefix, subcommand.name()];
    return subcommand.commands.length
      ? leafCommands(subcommand, commandPath)
      : [{ name: commandPath.join(" "), command: subcommand }];
  });
}

it.each(["README.md", "README.zh-CN.md"])("%s documents every CLI operation and option", (file) => {
  const document = fs.readFileSync(file, "utf8");
  const commands = leafCommands();
  expect(commands).toHaveLength(15);
  for (const { name, command } of commands) {
    expect(document).toContain(`#### \`${name}`);
    for (const option of command.options) {
      if (option.long) {
        expect(document).toContain(option.long);
      }
    }
  }
});

it("registers action-oriented query names and descriptive help without legacy aliases", () => {
  const program = createCli();
  const buildQuery = program.commands
    .find((command) => command.name() === "build")!
    .commands.find((command) => command.name() === "list-options")!;
  const openOCDQuery = program.commands
    .find((command) => command.name() === "openocd")!
    .commands.find((command) => command.name() === "list-configs")!;
  expect(buildQuery.description()).toContain("compatible boards and supported build types");
  expect(openOCDQuery.description()).toContain("does not access hardware");
  for (const query of [buildQuery, openOCDQuery]) {
    expect(query.aliases()).toEqual([]);
  }
  expect(program.commands.map((command) => command.name())).not.toEqual(
    expect.arrayContaining(["get-build-options", "get-openocd-config"]),
  );
});

it.each([["--board=hpm6750evkmini"], ["--board", "hpm6750evkmini"]])(
  "supports flag spelling %s",
  (...toolArguments) => {
    const sdkFixture = createSdkFixture();
    roots.push(sdkFixture.rootDirectory);
    const configFilePath = path.join(sdkFixture.rootDirectory, "config.json");
    new ConfigStore(configFilePath).save(sdkFixture.configuration);
    const result = invoke(["openocd", "list-configs", ...toolArguments], configFilePath);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).board_name).toBe("hpm6750evkmini");
  },
);
it.each([["-board=hpm6750evkmini"], ["-board", "hpm6750evkmini"]])(
  "rejects single-dash long options: %s",
  (...toolArguments) => {
    const sdkFixture = createSdkFixture();
    roots.push(sdkFixture.rootDirectory);
    const configFilePath = path.join(sdkFixture.rootDirectory, "config.json");
    const result = invoke(["openocd", "list-configs", ...toolArguments], configFilePath);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown option");
    expect(fs.existsSync(configFilePath)).toBe(false);
  },
);
it("parses clean booleans and rejects invalid flags", async () => {
  const program = createCli();
  const generateCommand = program.commands
    .find((command) => command.name() === "build")!
    .commands.find((command) => command.name() === "generate")!;
  let capturedOptions: {
    clean?: boolean;
  } = {};
  generateCommand.action((options: { clean?: boolean }) => {
    capturedOptions = options;
  });
  await program.parseAsync(["build", "generate", "--clean=false"], { from: "user" });
  expect(capturedOptions.clean).toBe(false);
  await createCli()
    .commands.find((command) => command.name() === "build")!
    .commands.find((command) => command.name() === "generate")!
    .action((options: { clean?: boolean }) => {
      capturedOptions = options;
    })
    .parseAsync(["--clean"], { from: "user" });
  expect(capturedOptions.clean).toBe(true);
  await expect(
    createCli().parseAsync(["build", "generate", "--clean=no"], { from: "user" }),
  ).rejects.toThrow();
  await expect(
    createCli().parseAsync(["build", "generate", "--unknown"], { from: "user" }),
  ).rejects.toThrow();
  await expect(
    createCli().parseAsync(["build", "generate", "--board"], { from: "user" }),
  ).rejects.toThrow();
});
it("CLI help and unknown command use proper exit codes", () => {
  expect(invoke(["--help"], "unused").status).toBe(0);
  const result = invoke(["unknown"], "unused");
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("unknown command");
  expect(result.stderr).not.toContain("error: error:");
});

it.each(["--version", "-V"])(
  "CLI %s matches package.json without loading configuration",
  (flag) => {
    const fixture = createSdkFixture();
    roots.push(fixture.rootDirectory);
    const file = path.join(fixture.rootDirectory, "missing", "config.json");
    const expectedVersion = JSON.parse(
      fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ).version;
    const result = invoke([flag], file);
    expect(version).toBe(expectedVersion);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(expectedVersion + "\n");
    expect(result.stderr).toBe("");
    expect(fs.existsSync(path.dirname(file))).toBe(false);
  },
);

it("reads the deployed package version rather than a source or working-directory version", () => {
  const fixture = createSdkFixture();
  roots.push(fixture.rootDirectory);
  const packageDirectory = path.join(fixture.rootDirectory, "deployed-package");
  fs.mkdirSync(packageDirectory);
  fs.cpSync("dist", path.join(packageDirectory, "dist"), { recursive: true });
  const metadata = JSON.parse(fs.readFileSync("package.json", "utf8"));
  metadata.version = "9.8.7-test";
  fs.writeFileSync(path.join(packageDirectory, "package.json"), JSON.stringify(metadata));
  const versionModuleURL = pathToFileURL(path.join(packageDirectory, "dist", "version.js")).href;
  const script = `import { version } from ${JSON.stringify(versionModuleURL)}; console.log(version);`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    encoding: "utf8",
    windowsHide: true,
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("9.8.7-test\n");
});

it("lists a missing configuration without creating its file or directory", () => {
  const fixture = createSdkFixture();
  roots.push(fixture.rootDirectory);
  const file = path.join(fixture.rootDirectory, "missing", "config.json");
  const result = invoke(["config", "list"], file);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout).hpm_sdk).toBe("");
  expect(fs.existsSync(path.dirname(file))).toBe(false);
});
it("CLI set/get/list/unset share persisted config", () => {
  const sdkFixture = createSdkFixture();
  roots.push(sdkFixture.rootDirectory);
  const configFilePath = path.join(sdkFixture.rootDirectory, "config.json");
  new ConfigStore(configFilePath).save(sdkFixture.configuration);
  expect(invoke(["config", "set", "env.CUSTOM", "value"], configFilePath).status).toBe(0);
  expect(invoke(["config", "get", "env.CUSTOM"], configFilePath).stdout).toBe("value\n");
  expect(JSON.parse(invoke(["config", "list"], configFilePath).stdout).env.CUSTOM).toBe("value");
  expect(invoke(["config", "unset", "env.CUSTOM"], configFilePath).status).toBe(0);
  expect(invoke(["config", "get", "env.CUSTOM"], configFilePath).stdout).toBe("\n");
});
it.each(["-board", "--clean=false", "", "中文 value"])(
  "does not reinterpret configuration values: %s",
  (value) => {
    const sdkFixture = createSdkFixture();
    roots.push(sdkFixture.rootDirectory);
    const configFilePath = path.join(sdkFixture.rootDirectory, "config.json");
    new ConfigStore(configFilePath).save(sdkFixture.configuration);
    const result = invoke(["config", "set", "env.CUSTOM", value], configFilePath);
    expect(result.status).toBe(0);
    expect(invoke(["config", "get", "env.CUSTOM"], configFilePath).stdout).toBe(value + "\n");
  },
);
it.each([
  { commandPath: ["build", "generate"] },
  { commandPath: ["config"] },
  { commandPath: ["project", "localize-sdk"] },
  { commandPath: ["openocd", "flash"] },
  { commandPath: ["mcp"] },
])("provides subcommand help without loading configuration: $commandPath", ({ commandPath }) => {
  const result = invoke([...commandPath, "--help"], "unused");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Usage:");
  expect(result.stdout).toContain(commandPath.at(-1));
});
it.each([
  ["false", false],
  ["0", false],
  ["f", false],
  ["TRUE", true],
  ["1", true],
  ["t", true],
])("parses explicit clean value %s", async (value, expected) => {
  const program = createCli();
  const generateCommand = program.commands
    .find((command) => command.name() === "build")!
    .commands.find((command) => command.name() === "generate")!;
  let parsedClean: boolean | undefined;
  generateCommand.action((options: { clean?: boolean }) => {
    parsedClean = options.clean;
  });
  await program.parseAsync(["build", "generate", "--clean=" + value], { from: "user" });
  expect(parsedClean).toBe(expected);
});
it("CLI config check and source mutual exclusion are preserved", () => {
  const sdkFixture = createSdkFixture();
  roots.push(sdkFixture.rootDirectory);
  const configFilePath = path.join(sdkFixture.rootDirectory, "config.json");
  new ConfigStore(configFilePath).save(sdkFixture.configuration);
  expect(invoke(["config", "check"], configFilePath).status).toBe(0);
  expect(
    invoke(
      [
        "build",
        "list-options",
        "--sample",
        "hello_world",
        "--app-dir",
        sdkFixture.applicationDirectory,
      ],
      configFilePath,
    ).status,
  ).toBe(1);
  expect(
    invoke(["config", "init", "--sdk-env", "x", "--cmake", "y"], configFilePath).stderr,
  ).toContain("mutually exclusive");
});
it("CLI discovery emits parseable JSON", () => {
  const sdkFixture = createSdkFixture();
  roots.push(sdkFixture.rootDirectory);
  const configFilePath = path.join(sdkFixture.rootDirectory, "config.json");
  new ConfigStore(configFilePath).save(sdkFixture.configuration);
  expect(
    JSON.parse(invoke(["build", "list-options", "--sample", "hello_world"], configFilePath).stdout)
      .boards,
  ).toHaveLength(1);
  expect(
    JSON.parse(
      invoke(["openocd", "list-configs", "--board", "hpm6750evkmini"], configFilePath).stdout,
    ).default.probe,
  ).toBe("ft2232");
});
