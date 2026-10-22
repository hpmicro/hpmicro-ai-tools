import type { HpmSdkService } from "../hpm-sdk-service.js";
import type { RunOptions } from "../runner.js";
import type * as hpm from "../operations/types.js";
import { startServer } from "../mcp/server.js";
import {
  serializeBuildOptions,
  serializeOpenOCDConfig,
  serializeConfig,
} from "../output-format.js";
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

/** Adapts CLI arguments to business operations and presents their results. */
export class CliHandlers {
  /** Sends tool output to stderr, keeping structured CLI output on stdout. */
  private readonly executionOptions: RunOptions = {
    stdout: process.stderr,
    stderr: process.stderr,
  };

  /** Holds the business dependency shared by all command handlers. */
  constructor(private readonly service: HpmSdkService) {}

  /** Rejects command groups invoked without an action. */
  missingSubcommand(group: string): void {
    throw new Error(`missing ${group} subcommand`);
  }

  /** Maps initialization options, validates tool versions, and saves settings. */
  async initialize(options: InitializeOptions): Promise<void> {
    const result = await this.service.initialize(options);
    console.log("created", result.path);
    printJSON(serializeConfig(result.configuration));
  }

  /** Prints the current persisted configuration. */
  listConfig(): void {
    printJSON(serializeConfig(this.service.readConfig()));
  }

  /** Prints one canonical configuration value. */
  getConfigValue(key: string): void {
    console.log(this.service.getConfigValue(key));
  }

  /** Validates and saves one setting, then reports its destination. */
  async setConfigValue(key: string, value: string): Promise<void> {
    const result = await this.service.setConfigValue(key, value);
    console.log("updated", result.path);
  }

  /** Clears one setting and reports the saved configuration path. */
  unsetConfigValue(key: string): void {
    console.log("updated", this.service.unsetConfigValue(key).path);
  }

  /** Prints diagnostic checks and fails when required settings are invalid. */
  checkConfig(): void {
    const checks = this.service.doctor();
    for (const check of checks) {
      const details = check.message ? ": " + check.message : "";
      console.log(`[${check.status.toUpperCase()}] ${check.name}${details}`);
    }
    if (checks.some((check) => check.status === "error")) {
      throw new Error("config check found errors");
    }
  }

  /** Maps CLI options and generates the requested project. */
  async generate(options: GenerateOptions): Promise<void> {
    const input: hpm.GenerateInput = {
      sample: options.sample,
      appDir: options.appDir,
      board: options.board,
      customBoard: options.customBoard,
      hpmBuildType: options.hpmBuildType || "",
      cmakeBuildType: options.cmakeBuildType || "",
      customGccLinkerFile: options.customGccLinker,
      buildDir: options.buildDir,
      clean: options.clean,
    };
    await runOperation(
      (result) => `generate succeeded${result.buildDir ? ": " + result.buildDir : ""}`,
      "cmake",
      () => this.service.generate(input, this.executionOptions),
    );
  }

  /** Compiles an existing generated project and reports the result. */
  async compile(options: BuildDirectoryOptions): Promise<void> {
    await runOperation(
      (result) => `compile succeeded${result.buildDir ? ": " + result.buildDir : ""}`,
      "ninja",
      () => this.service.compile(options.buildDir || "", this.executionOptions),
    );
  }

  /** Runs the SDK localization target and reports the result. */
  async localize(options: BuildDirectoryOptions): Promise<void> {
    await runOperation(
      () => "localize succeeded",
      "ninja localize_sdk",
      () => this.service.localize(options.buildDir || "", this.executionOptions),
    );
  }

  /** Restores the original application entry point and reports the result. */
  unlocalize(options: UnlocalizeOptions): void {
    const result = this.service.unlocalize(options.localizedDir || "");
    console.log("unlocalize succeeded:", result.localizedDir);
  }

  /** Validates CLI source selection and prints build capabilities. */
  buildOptions(options: ApplicationOptions): void {
    if (!options.sample && !options.appDir) {
      throw new Error("--sample or --app-dir is required");
    }
    if (options.sample && options.appDir) {
      throw new Error("--sample and --app-dir cannot be used together");
    }
    printJSON(serializeBuildOptions(this.service.getBuildOptions(options.sample, options.appDir)));
  }

  /** Writes and verifies firmware using the selected OpenOCD settings. */
  async flash(options: FlashOptions): Promise<void> {
    await runOperation(
      () => "flash succeeded",
      "openocd",
      () =>
        this.service.flash(
          {
            probe: options.probe || "",
            soc: options.soc || "",
            board: options.board || "",
            file: options.file || "",
            address: options.address,
          },
          this.executionOptions,
        ),
    );
  }

  /** Starts the debug server and waits for it to exit. */
  async gdbserver(options: GDBServerOptions): Promise<void> {
    await runOperation(
      () => "gdbserver exited",
      "openocd",
      () =>
        this.service.gdbserver(
          {
            probe: options.probe || "",
            soc: options.soc || "",
            board: options.board || "",
          },
          this.executionOptions,
        ),
    );
  }

  /** Requires a board selection and prints OpenOCD candidates. */
  openOCDConfig(options: OpenOCDConfigOptions): void {
    if (!options.board) {
      throw new Error("--board is required");
    }
    printJSON(serializeOpenOCDConfig(this.service.getOpenOCDConfig(options.board, options.app)));
  }

  /** Starts the MCP adapter with the same business dependencies. */
  serveMcp(): Promise<void> {
    return startServer(this.service);
  }
}

/** Prints formatted JSON, omitting empty optional configuration fields. */
function printJSON(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

/** Reports operation success or a nonzero exit without duplicating action-specific execution. */
async function runOperation(
  successMessage: (result: hpm.Output) => string,
  toolName: string,
  operation: () => Promise<hpm.Output>,
): Promise<void> {
  const result = await operation();
  if (result.exitCode !== 0) {
    throw new Error(`${toolName} exited with code ${result.exitCode}`);
  }
  console.log(successMessage(result));
}
