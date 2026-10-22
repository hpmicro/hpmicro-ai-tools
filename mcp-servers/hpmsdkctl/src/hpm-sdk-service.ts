import * as config from "./config/config.js";
import { ConfigStore } from "./config/config-store.js";
import type { ConfigData, InitInput, Check, SavedConfig } from "./config/config-type.js";
import { TOOL_DEFINITIONS, resolveConfigKey } from "./config/config-keys.js";
import * as build from "./operations/build.js";
import * as debug from "./operations/debug.js";
import * as localization from "./operations/localization.js";
import { getBuildOptions } from "./discovery/build.js";
import { getOpenOCDConfig } from "./discovery/openocd.js";
import type { BuildOptions, OpenOCDInfo } from "./discovery/types.js";
import type { GenerateInput, FlashInput, GDBInput, Output } from "./operations/types.js";
import { run, type Runner, type RunOptions } from "./runner.js";

/** Optional dependencies used when creating a service. */
export interface ServiceOptions {
  /** Explicit configuration file; defaults to the platform user configuration path. */
  configPath?: string;
  /** Tool execution adapter; defaults to direct local process execution. */
  runner?: Runner;
}

/** Failed configuration operation with its last in-memory state for response formatting. */
export class ConfigOperationError extends Error {
  constructor(
    cause: unknown,
    public readonly configuration: ConfigData | null,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "ConfigOperationError";
  }
}

/**
 * Shared business entry point for CLI and MCP callers.
 * Holds dependencies, not a configuration snapshot: every operation loads the latest settings.
 * Pure validation, discovery, argument construction, and execution remain in focused modules.
 */
export class HpmSdkService {
  constructor(
    private readonly configStore: ConfigStore,
    private readonly runner: Runner,
  ) {}

  /** Reads the latest settings without checking tool availability. */
  readConfig(): ConfigData {
    return this.configStore.load().toData();
  }

  /** Reads a canonical key or alias from the current persisted configuration. */
  getConfigValue(key: string): string {
    return this.configStore.load().get(key);
  }

  /** Updates, validates, and persists one setting; failed validation does not save it. */
  async setConfigValue(key: string, value: string): Promise<SavedConfig> {
    let configuration: config.Config | null = null;
    try {
      configuration = this.configStore.load();
      configuration.set(key, value);
      await config.validateTool(resolveConfigKey(key), value, this.runner);
      return { path: this.configStore.save(configuration), configuration: configuration.toData() };
    } catch (error) {
      throw new ConfigOperationError(error, configuration?.toData() ?? null);
    }
  }

  /** Clears and persists a canonical key or alias; does not run tool version checks. */
  unsetConfigValue(key: string): SavedConfig {
    const configuration = this.configStore.load();
    configuration.unset(key);
    return { path: this.configStore.save(configuration), configuration: configuration.toData() };
  }

  /** Builds settings, validates paths and tool versions, and saves only on success. */
  async initialize(input: InitInput): Promise<SavedConfig> {
    let configuration: config.Config | null = null;
    try {
      configuration = config.Config.fromInput(input);
      configuration.validate();
      const toolKeys = [
        "hpm_sdk",
        ...TOOL_DEFINITIONS.map(({ key }) => key),
        "env.GNURISCV_TOOLCHAIN_PATH",
      ];
      for (const key of toolKeys) {
        await config.validateTool(key, configuration.get(key), this.runner);
      }
      return { path: this.configStore.save(configuration), configuration: configuration.toData() };
    } catch (error) {
      throw new ConfigOperationError(error, configuration?.toData() ?? null);
    }
  }

  /** Reports path and SDK environment checks without running external tools. */
  doctor(): Check[] {
    return this.configStore.load().doctor();
  }

  /** Queries build capabilities; does not require the compiler tools to be available. */
  getBuildOptions(sample = "", applicationDirectory = ""): BuildOptions {
    return getBuildOptions(this.configStore.load(), sample, applicationDirectory);
  }

  /** Queries OpenOCD candidates using the latest validated configuration. */
  getOpenOCDConfig(board: string, applicationSource = ""): OpenOCDInfo {
    return getOpenOCDConfig(this.loadValidatedConfig(), board, applicationSource);
  }

  /** Validates configuration and generates the requested project; clean may delete its build directory. */
  generate(input: GenerateInput, executionOptions: RunOptions = {}): Promise<Output> {
    return build.generate(this.loadValidatedConfig(), input, executionOptions, this.runner);
  }

  /** Validates configuration and compiles an existing generated project. */
  compile(buildDirectory: string, executionOptions: RunOptions = {}): Promise<Output> {
    return build.compile(this.loadValidatedConfig(), buildDirectory, executionOptions, this.runner);
  }

  /** Validates configuration and invokes the SDK localization target. */
  localize(buildDirectory: string, executionOptions: RunOptions = {}): Promise<Output> {
    return localization.localize(
      this.loadValidatedConfig(),
      buildDirectory,
      executionOptions,
      this.runner,
    );
  }

  /** Validates configuration and restores the original CMake entry point from its backup. */
  unlocalize(applicationDirectory: string): ReturnType<typeof localization.unlocalize> {
    this.loadValidatedConfig();
    return localization.unlocalize(applicationDirectory);
  }

  /** Validates configuration and writes/verifies firmware on real target hardware. */
  flash(input: FlashInput, executionOptions: RunOptions = {}): Promise<Output> {
    return debug.flash(this.loadValidatedConfig(), input, executionOptions, this.runner);
  }

  /** Starts OpenOCD and waits for exit; cancellation is controlled by executionOptions.signal. */
  gdbserver(input: GDBInput, executionOptions: RunOptions = {}): Promise<Output> {
    return debug.gdbserver(this.loadValidatedConfig(), input, executionOptions, this.runner);
  }

  /** Reads and validates per operation so a long-running MCP instance never caches stale paths. */
  private loadValidatedConfig(): config.Config {
    const configuration = this.configStore.load();
    configuration.validate();
    return configuration;
  }
}

/** Creates a service without reading configuration or starting external processes. */
export function createService(options: ServiceOptions = {}): HpmSdkService {
  return new HpmSdkService(new ConfigStore(options.configPath), options.runner ?? run);
}
