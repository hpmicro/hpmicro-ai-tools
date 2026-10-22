import { Command, InvalidArgumentError } from "commander";
import { createService, type HpmSdkService } from "../hpm-sdk-service.js";
import { CliHandlers } from "./cli-handlers.js";
import { version } from "../version.js";
import type {
  ApplicationOptions,
  GenerateOptions,
  InitializeOptions,
  BuildDirectoryOptions,
  UnlocalizeOptions,
  OpenOCDConfigOptions,
  FlashOptions,
  GDBServerOptions,
} from "./cli-type.js";

/** Parses explicit boolean values; Commander handles bare boolean options. */
function parseBoolean(value: string): boolean {
  switch (value.toLowerCase()) {
    case "true":
    case "t":
    case "1":
      return true;
    case "false":
    case "f":
    case "0":
      return false;
    default:
      throw new InvalidArgumentError("Expected true, false, t, f, 1, or 0.");
  }
}

/** Adds shared application source options. */
function addApplicationOptions(command: Command): Command {
  return command
    .option("--sample <path>", "Sample path under SDK samples")
    .option("--app-dir <path>", "External application directory");
}

/** Registers configuration commands with explicit arguments and independent handlers. */
function registerConfigCommands(program: Command, handlers: CliHandlers): void {
  // Configuration command group; a subcommand is required.
  // Example: hpmsdkctl config --help
  const configurationCommand = program
    .command("config")
    .description("Initialize, inspect, and update SDK tool configuration")
    .enablePositionalOptions()
    .action(() => handlers.missingSubcommand("config"));

  // Initialize SDK and tool paths from an SDK Env installation.
  // Example: hpmsdkctl config init --sdk-env "D:/tools/sdk_env"
  configurationCommand
    .command("init")
    .description("Initialize SDK and tool paths")
    .option("--sdk-env <path>", "SDK Env directory")
    .option("--hpm-sdk <path>", "HPM SDK directory")
    .option("--cmake <path>", "CMake executable")
    .option("--ninja <path>", "Ninja executable")
    .option("--python <path>", "Python executable")
    .option("--openocd <path>", "OpenOCD executable")
    .option("--toolchain <path>", "RISC-V toolchain directory")
    .option("--toolchain-variant <name>", "Toolchain variant")
    .action((options: InitializeOptions) => handlers.initialize(options));

  // Print all persisted configuration values as JSON.
  // Example: hpmsdkctl config list
  configurationCommand
    .command("list")
    .description("Print persisted configuration as JSON")
    .action(() => handlers.listConfig());

  // Read one configuration value using its canonical key.
  // Example: hpmsdkctl config get tools.python
  configurationCommand
    .command("get")
    .description("Read a canonical configuration key")
    .passThroughOptions()
    .argument("<key>", "Configuration key")
    .action((key: string) => handlers.getConfigValue(key));

  // Validate and persist a configuration value.
  // Example: hpmsdkctl config set tools.python "D:/tools/python/python.exe"
  configurationCommand
    .command("set")
    .description("Update and save a configuration key")
    .passThroughOptions()
    .argument("<key>", "Configuration key or supported alias")
    .argument("<value>", "New value")
    .action((key: string, value: string) => handlers.setConfigValue(key, value));

  // Clear a configuration value using its canonical key.
  // Example: hpmsdkctl config unset tools.openocd
  configurationCommand
    .command("unset")
    .description("Clear and save a canonical configuration key")
    .passThroughOptions()
    .argument("<key>", "Configuration key")
    .action((key: string) => handlers.unsetConfigValue(key));

  // Check configured paths and SDK environment consistency.
  // Example: hpmsdkctl config check
  configurationCommand
    .command("check")
    .description("Check SDK paths and environment consistency")
    .action(() => handlers.checkConfig());
}

/** Registers build and project commands with explicit action names. */
function registerBuildCommands(program: Command, handlers: CliHandlers): void {
  const buildCommand = program
    .command("build")
    .description("Query, generate, and compile HPM SDK builds")
    .enablePositionalOptions()
    .action(() => handlers.missingSubcommand("build"));

  // Generate a Ninja project for an SDK sample or an external application.
  // Example: hpmsdkctl build generate --sample hello_world --board hpm6750evkmini
  addApplicationOptions(
    buildCommand.command("generate").description("Generate a Ninja build directory"),
  )
    .option("--board <name>", "SDK board name")
    .option("--custom-board <path>", "Custom board directory")
    .option("--hpm-build-type <name>", "SDK build type")
    .option("--cmake-build-type <name>", "CMake build type")
    .option("--custom-gcc-linker <path>", "Custom GCC linker script")
    .option("--build-dir <path>", "Output build directory")
    .option("--clean [boolean]", "Clear build directory before generation", parseBoolean)
    .action((options: GenerateOptions) => handlers.generate(options));

  // Compile a project that already contains build.ninja.
  // Example: hpmsdkctl build compile --build-dir "D:/projects/demo/build"
  buildCommand
    .command("compile")
    .description("Compile an existing Ninja project")
    .option("--build-dir <path>", "Generated build directory")
    .action((options: BuildDirectoryOptions) => handlers.compile(options));

  // Discover compatible boards and build types without generating a project.
  // Example: hpmsdkctl build list-options --sample hello_world
  addApplicationOptions(
    buildCommand
      .command("list-options")
      .description(
        "List compatible boards and supported build types for an SDK sample or external application",
      ),
  ).action((options: ApplicationOptions) => handlers.buildOptions(options));

  const projectCommand = program
    .command("project")
    .description("Localize or unlocalize SDK dependencies in an application")
    .enablePositionalOptions()
    .action(() => handlers.missingSubcommand("project"));

  // Copy SDK dependencies into the application using its generated build.
  // Example: hpmsdkctl project localize-sdk --build-dir "D:/projects/demo/build"
  projectCommand
    .command("localize-sdk")
    .description("Run the SDK localization target")
    .option("--build-dir <path>", "Generated build directory")
    .action((options: BuildDirectoryOptions) => handlers.localize(options));

  // Restore the original CMake entry point in a localized application.
  // Example: hpmsdkctl project unlocalize-sdk --localized-dir "D:/projects/demo"
  projectCommand
    .command("unlocalize-sdk")
    .description("Restore the original CMake entry point")
    .option("--localized-dir <path>", "Localized application directory")
    .action((options: UnlocalizeOptions) => handlers.unlocalize(options));
}

/** Adds shared OpenOCD configuration options. */
function addOpenOCDOptions(command: Command): Command {
  return command
    .option("--probe <name>", "Probe configuration name or cfg path")
    .option("--soc <name>", "SoC configuration name or cfg path")
    .option("--board <name>", "Board configuration name or cfg path");
}

/** Registers hardware commands; registration itself does not access hardware. */
function registerDebugCommands(program: Command, handlers: CliHandlers): void {
  const openOCDCommand = program
    .command("openocd")
    .description("Discover OpenOCD settings, flash firmware, or start a GDB server")
    .enablePositionalOptions()
    .action(() => handlers.missingSubcommand("openocd"));

  // Write and verify firmware on connected target hardware.
  // Example: hpmsdkctl openocd flash --probe ft2232 --soc hpm6750-single-core --board hpm6750evkmini --file "D:/projects/demo/build/output/demo.elf"
  addOpenOCDOptions(
    openOCDCommand.command("flash").description("Write and verify firmware on target hardware"),
  )
    .option("--file <path>", "Firmware file")
    .option("--address <address>", "Explicit flash address")
    .action((options: FlashOptions) => handlers.flash(options));

  // Start OpenOCD and keep it running until it exits or is cancelled.
  // Example: hpmsdkctl openocd start-gdb-server --probe ft2232 --soc hpm6750-single-core --board hpm6750evkmini
  addOpenOCDOptions(
    openOCDCommand
      .command("start-gdb-server")
      .description("Start OpenOCD's GDB server and wait for exit"),
  ).action((options: GDBServerOptions) => handlers.gdbserver(options));

  // Discover OpenOCD configurations and infer defaults without accessing hardware.
  // Example: hpmsdkctl openocd list-configs --board hpm6750evkmini --app hello_world
  openOCDCommand
    .command("list-configs")
    .description(
      "List SDK OpenOCD configuration files and infer defaults for a board; does not access hardware",
    )
    .option("--board <name>", "SDK board name or board directory")
    .option("--app <path>", "Optional sample name or application directory")
    .action((options: OpenOCDConfigOptions) => handlers.openOCDConfig(options));
}

/** Registers the MCP command without starting the server. */
function registerMcpCommands(program: Command, handlers: CliHandlers): void {
  // Serve MCP requests over stdin/stdout; the client controls the process lifetime.
  // Example: hpmsdkctl mcp
  program
    .command("mcp")
    .description("Serve MCP over stdio")
    .action(() => handlers.serveMcp());
}

/** Creates a fresh command tree without configuration or hardware side effects. */
export function createCli(service: HpmSdkService = createService()): Command {
  const handlers = new CliHandlers(service);

  const program = new Command()
    .name("hpmsdkctl")
    .version(version)
    .description("HPM SDK command-line tools and MCP server")
    .enablePositionalOptions()
    .exitOverride()
    .configureOutput({ writeErr: () => {} });

  registerConfigCommands(program, handlers);
  registerBuildCommands(program, handlers);
  registerDebugCommands(program, handlers);
  registerMcpCommands(program, handlers);

  return program;
}
