import { ConfigOperationError, type HpmSdkService } from "../hpm-sdk-service.js";
import { structuredResponse, processResponse, errorMessage } from "./responses.js";
import {
  serializeBuildOptions,
  serializeOpenOCDConfig,
  serializeConfig,
} from "../output-format.js";
import type {
  ProcessToolResponse,
  StructuredToolResponse,
  ConfigGetOutput,
  ConfigSavedOutput,
  ConfigListOutput,
  ConfigDoctorOutput,
  BuildOptionsOutput,
  OpenOCDConfigOutput,
  UnlocalizeOutput,
  ConfigGetInput,
  ConfigUnsetInput,
  ConfigSetInput,
  ConfigInitInput,
  BuildOptionsInput,
  OpenOCDConfigInput,
  GenerateToolInput,
  BuildDirectoryInput,
  FlashToolInput,
  GDBServerInput,
  UnlocalizeInput,
} from "./mcp-type.js";

/** Adapts validated MCP input to shared business operations and protocol responses. */
export class McpHandlers {
  /** Holds the business dependency shared by all registered tools. */
  constructor(private readonly service: HpmSdkService) {}

  /** Reads one setting and formats configuration lookup errors. */
  async getConfigValue({ key }: ConfigGetInput): Promise<StructuredToolResponse<ConfigGetOutput>> {
    try {
      return structuredResponse({
        ok: true,
        key,
        value: this.service.getConfigValue(key),
      });
    } catch (error) {
      return structuredResponse({ ok: false, error: errorMessage(error), key, value: "" });
    }
  }

  /** Validates and saves one setting, preserving the failed configuration snapshot. */
  async setConfigValue({
    key,
    value,
  }: ConfigSetInput): Promise<StructuredToolResponse<ConfigSavedOutput>> {
    try {
      const saved = await this.service.setConfigValue(key, value);
      return structuredResponse({
        ok: true,
        path: saved.path,
        config: serializeConfig(saved.configuration),
      });
    } catch (error) {
      return structuredResponse({
        ok: false,
        error: errorMessage(error),
        path: "",
        config:
          error instanceof ConfigOperationError && error.configuration
            ? serializeConfig(error.configuration)
            : null,
      });
    }
  }

  /** Clears and persists one setting, returning the updated configuration snapshot. */
  async unsetConfigValue({
    key,
  }: ConfigUnsetInput): Promise<StructuredToolResponse<ConfigSavedOutput>> {
    try {
      const saved = this.service.unsetConfigValue(key);
      return structuredResponse({
        ok: true,
        path: saved.path,
        config: serializeConfig(saved.configuration),
      });
    } catch (error) {
      return structuredResponse({ ok: false, error: errorMessage(error), path: "", config: null });
    }
  }

  /** Maps protocol fields to internal initialization input and formats the saved result. */
  async initialize(input: ConfigInitInput): Promise<StructuredToolResponse<ConfigSavedOutput>> {
    try {
      const saved = await this.service.initialize({
        sdkEnv: input.sdk_env,
        hpmSdk: input.hpm_sdk,
        cmake: input.cmake,
        ninja: input.ninja,
        python: input.python,
        openocd: input.openocd,
        toolchain: input.toolchain,
        toolchainVariant: input.toolchain_variant,
      });
      return structuredResponse({
        ok: true,
        path: saved.path,
        config: serializeConfig(saved.configuration),
      });
    } catch (error) {
      return structuredResponse({
        ok: false,
        error: errorMessage(error),
        path: "",
        config:
          error instanceof ConfigOperationError && error.configuration
            ? serializeConfig(error.configuration)
            : null,
      });
    }
  }

  /** Reads and serializes the current configuration without validating tool availability. */
  async listConfig(): Promise<StructuredToolResponse<ConfigListOutput>> {
    try {
      return structuredResponse({ ok: true, config: serializeConfig(this.service.readConfig()) });
    } catch (error) {
      return structuredResponse({ ok: false, error: errorMessage(error), config: null });
    }
  }

  /** Returns diagnostic checks and marks required-setting failures. */
  async doctor(): Promise<StructuredToolResponse<ConfigDoctorOutput>> {
    try {
      const checks = this.service.doctor();
      const ok = !checks.some((check) => check.status === "error");
      return structuredResponse({
        ok,
        ...(!ok ? { error: "config check found errors" } : {}),
        checks,
      });
    } catch (error) {
      return structuredResponse({ ok: false, error: errorMessage(error), checks: null });
    }
  }

  /** Queries compatible boards and build types for the requested application. */
  async getBuildOptions(
    input: BuildOptionsInput,
  ): Promise<StructuredToolResponse<BuildOptionsOutput>> {
    try {
      return structuredResponse({
        ok: true,
        ...serializeBuildOptions(this.service.getBuildOptions(input.sample, input.app_dir)),
      });
    } catch (error) {
      return structuredResponse({
        ok: false,
        error: errorMessage(error),
        app_dir: null,
        boards: null,
      });
    }
  }

  /** Queries SDK OpenOCD candidates and inferred board defaults. */
  async getOpenOCDConfig(
    input: OpenOCDConfigInput,
  ): Promise<StructuredToolResponse<OpenOCDConfigOutput>> {
    try {
      return structuredResponse({
        ok: true,
        ...serializeOpenOCDConfig(this.service.getOpenOCDConfig(input.board, input.app)),
      });
    } catch (error) {
      return structuredResponse({
        ok: false,
        error: errorMessage(error),
        board_name: input.board,
        probes: null,
        socs: null,
        boards: null,
      });
    }
  }

  /** Generates a project and propagates request cancellation to the process runner. */
  async generate(input: GenerateToolInput, signal: AbortSignal): Promise<ProcessToolResponse> {
    return processResponse(() =>
      this.service.generate(
        {
          sample: input.sample,
          appDir: input.app_dir,
          board: input.board,
          customBoard: input.custom_board,
          hpmBuildType: input.hpm_build_type,
          cmakeBuildType: input.cmake_build_type,
          customGccLinkerFile: input.custom_gcc_linker_file,
          buildDir: input.build_dir,
          clean: input.clean,
        },
        { signal },
      ),
    );
  }

  /** Compiles a generated project and propagates request cancellation. */
  async compile(input: BuildDirectoryInput, signal: AbortSignal): Promise<ProcessToolResponse> {
    return processResponse(() => this.service.compile(input.build_dir, { signal: signal }));
  }

  /** Writes and verifies firmware while preserving process errors and cancellation. */
  async flash(input: FlashToolInput, signal: AbortSignal): Promise<ProcessToolResponse> {
    return processResponse(() => this.service.flash(input, { signal: signal }));
  }

  /** Starts the debug server and propagates cancellation while waiting for exit. */
  async gdbserver(input: GDBServerInput, signal: AbortSignal): Promise<ProcessToolResponse> {
    return processResponse(() => this.service.gdbserver(input, { signal: signal }));
  }

  /** Runs SDK localization and returns the process output. */
  async localize(input: BuildDirectoryInput, signal: AbortSignal): Promise<ProcessToolResponse> {
    return processResponse(() => this.service.localize(input.build_dir, { signal: signal }));
  }

  /** Restores the original CMake entry point and formats filesystem failures. */
  async unlocalize(input: UnlocalizeInput): Promise<StructuredToolResponse<UnlocalizeOutput>> {
    try {
      const result = this.service.unlocalize(input.localized_dir);
      return structuredResponse({ ok: result.ok, localized_dir: result.localizedDir });
    } catch (error) {
      return structuredResponse({
        localized_dir: input.localized_dir,
        ok: false,
        error: errorMessage(error),
      });
    }
  }
}
