import * as fs from "node:fs";
import * as path from "node:path";
import { run, type Runner } from "../runner.js";
import { exists } from "./config-path.js";
import { parse } from "yaml";
import type { ConfigData, ConfigJSON, Check, InitInput } from "./config-type.js";
export { defaultPath, exists } from "./config-path.js";
import { TOOL_DEFINITIONS, resolveConfigKey, isToolKey } from "./config-keys.js";

/** Configuration values and their domain behavior; does not persist files or execute tools. */
export class Config implements ConfigData {
  /** HPM SDK root directory. */
  hpmSdk: string;
  /** Optional SDK Env root directory. */
  sdkEnv?: string;
  /** Configured tool executable paths. */
  tools: ConfigData["tools"];
  /** Tool process environment overrides. */
  env: Record<string, string>;

  /** Copies configuration values without normalizing or validating paths. */
  constructor(
    data: ConfigData = { hpmSdk: "", tools: { cmake: "", ninja: "", python: "" }, env: {} },
  ) {
    this.hpmSdk = data.hpmSdk;
    if (data.sdkEnv !== undefined) {
      this.sdkEnv = data.sdkEnv;
    }
    this.tools = { ...data.tools };
    this.env = { ...data.env };
  }

  /** Creates configuration from SDK Env or explicit paths; does not save or run version checks. */
  static fromInput(input: InitInput): Config {
    const explicitPaths = [
      input.hpmSdk,
      input.cmake,
      input.ninja,
      input.python,
      input.openocd,
      input.toolchain,
    ];
    if (input.sdkEnv) {
      if (explicitPaths.some(Boolean)) {
        throw new Error("sdkEnv is mutually exclusive with explicit tool paths");
      }
      return new Config(readSDKEnv(input.sdkEnv));
    }
    if (!explicitPaths.some(Boolean)) {
      throw new Error("no configuration provided; specify sdkEnv or individual tool paths");
    }
    return new Config({
      hpmSdk: input.hpmSdk || "",
      tools: {
        cmake: input.cmake || "",
        ninja: input.ninja || "",
        python: input.python || "",
        openocd: input.openocd || "",
      },
      env: {
        HPM_SDK_BASE: input.hpmSdk || "",
        GNURISCV_TOOLCHAIN_PATH: input.toolchain || "",
        HPM_SDK_TOOLCHAIN_VARIANT: input.toolchainVariant || "gcc",
      },
    }).normalize();
  }

  /** Restores JSON values, applying omitted-field defaults and rejecting invalid values. */
  static fromJSON(data: unknown): Config {
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("invalid config object");
    }
    const parsedConfig = data as {
      hpm_sdk?: unknown;
      sdk_env?: unknown;
      tools?: Record<string, unknown>;
      env?: Record<string, unknown>;
    };
    // Omitted fields receive zero defaults; provided values must have the expected types.
    const configuration = newConfig();
    const fieldMappings = [
      ["hpm_sdk", "hpmSdk"],
      ["sdk_env", "sdkEnv"],
    ] as const;
    for (const [key, property] of fieldMappings) {
      if (parsedConfig[key] != null) {
        if (typeof parsedConfig[key] !== "string") {
          throw new Error(`invalid config ${key}`);
        }
        configuration[property] = parsedConfig[key];
      }
    }
    if (parsedConfig.tools != null) {
      for (const { name: key } of TOOL_DEFINITIONS) {
        if (parsedConfig.tools[key] != null) {
          if (typeof parsedConfig.tools[key] !== "string") {
            throw new Error(`invalid config tools.${key}`);
          }
          configuration.tools[key] = parsedConfig.tools[key];
        }
      }
    }
    if (parsedConfig.env != null) {
      for (const [key, value] of Object.entries(parsedConfig.env)) {
        if (typeof value !== "string" && value !== null) {
          throw new Error(`invalid config env.${key}`);
        }
        configuration.env[key] = value ?? "";
      }
    }
    return configuration;
  }

  /** Fills env and a missing HPM_SDK_BASE in place; preserves existing BASE and object identity. */
  normalize(): this {
    this.env ||= {};
    if (!this.env.HPM_SDK_BASE && this.hpmSdk) {
      this.env.HPM_SDK_BASE = this.hpmSdk;
    }
    return this;
  }

  /** Returns an independent camelCase snapshot without exposing mutable state. */
  toData(): ConfigData {
    return {
      hpmSdk: this.hpmSdk,
      ...(this.sdkEnv !== undefined ? { sdkEnv: this.sdkEnv } : {}),
      tools: { ...this.tools },
      env: { ...this.env },
    };
  }

  /** Omits empty sdk_env/openocd fields and copies mutable nested values. */
  toJSON(): ConfigJSON {
    return {
      hpm_sdk: this.hpmSdk,
      ...(this.sdkEnv ? { sdk_env: this.sdkEnv } : {}),
      tools: {
        cmake: this.tools.cmake,
        ninja: this.tools.ninja,
        python: this.tools.python,
        ...(this.tools.openocd ? { openocd: this.tools.openocd } : {}),
      },
      env: { ...this.env },
    };
  }

  /** Reads canonical keys or aliases, returning empty strings for unset values. */
  get(key: string): string {
    const canonicalKey = resolveConfigKey(key);
    key = canonicalKey;
    if (key === "hpm_sdk") {
      return this.hpmSdk;
    }
    if (isToolKey(canonicalKey)) {
      return this.tools[key.slice(6) as keyof Config["tools"]] || "";
    }
    if (key.startsWith("env.")) {
      return this.env[key.slice(4)] || "";
    }
    throw new Error(`unknown config key ${JSON.stringify(key)}`);
  }

  /** Updates canonical keys or aliases in place; hpm_sdk synchronizes BASE, without saving. */
  set(key: string, value: string): void {
    this.normalize();
    const canonicalKey = resolveConfigKey(key);
    key = canonicalKey;
    if (key === "hpm_sdk") {
      this.hpmSdk = value;
      this.env.HPM_SDK_BASE = value;
    } else if (isToolKey(canonicalKey)) {
      this.tools[key.slice(6) as keyof Config["tools"]] = value;
    } else if (key.startsWith("env.")) {
      this.env[key.slice(4)] = value;
    } else {
      throw new Error(`unknown config key ${JSON.stringify(key)}`);
    }
  }

  /** Clears canonical keys or aliases in place; hpm_sdk also removes BASE. Does not save. */
  unset(key: string): void {
    this.normalize();
    const canonicalKey = resolveConfigKey(key);
    key = canonicalKey;
    if (key === "hpm_sdk") {
      this.hpmSdk = "";
      delete this.env.HPM_SDK_BASE;
    } else if (isToolKey(canonicalKey)) {
      this.tools[key.slice(6) as keyof Config["tools"]] = "";
    } else if (key.startsWith("env.")) {
      delete this.env[key.slice(4)];
    } else {
      throw new Error(`unknown config key ${JSON.stringify(key)}`);
    }
  }

  /**
   * Builds the tool environment: prepends tool directories to PATH, then applies config overrides.
   * Deduplicates keys case-insensitively to handle Windows PATH/Path variants.
   * Normalizes config in place, leaving base and process.env unchanged; explicit PATH wins.
   */
  environment(baseEnvironment = process.env): NodeJS.ProcessEnv {
    this.normalize();
    const environmentVariables = { ...baseEnvironment };
    const toolDirectories: string[] = [];
    for (const { name } of TOOL_DEFINITIONS) {
      const value = this.tools[name];
      if (value) {
        let isDirectory = false;
        try {
          isDirectory = fs.statSync(value).isDirectory();
        } catch {
          // An inaccessible tool path is treated as a file path; doctor reports the access error.
        }
        toolDirectories.push(isDirectory ? value : path.dirname(value));
      }
    }
    const toolchainDirectory = this.env.GNURISCV_TOOLCHAIN_PATH;
    if (toolchainDirectory) {
      const toolchainBinDirectory = path.join(toolchainDirectory, "bin");
      toolDirectories.push(
        exists(toolchainBinDirectory) && fs.statSync(toolchainBinDirectory).isDirectory()
          ? toolchainBinDirectory
          : toolchainDirectory,
      );
    }
    const setEnvironmentVariable = (key: string, value: string) => {
      for (const existingKey of Object.keys(environmentVariables)) {
        if (existingKey.toLowerCase() === key.toLowerCase()) {
          delete environmentVariables[existingKey];
        }
      }
      environmentVariables[key] = value;
    };
    const inheritedPath =
      Object.entries(baseEnvironment).find(([key]) => key.toLowerCase() === "path")?.[1] || "";
    if (toolDirectories.length) {
      setEnvironmentVariable(
        "PATH",
        toolDirectories.join(path.delimiter) + path.delimiter + inheritedPath,
      );
    }
    for (const key of Object.keys(this.env).sort()) {
      setEnvironmentVariable(key, this.env[key]);
    }
    return environmentVariables;
  }

  /** Checks path accessibility and SDK/BASE consistency; normalizes in place without running tools. */
  doctor(): Check[] {
    this.normalize();
    const check = (name: string, configuredPath: string | undefined, required: boolean): Check => {
      if (!configuredPath) {
        return {
          name,
          status: required ? "error" : "warn",
          message: "not configured",
        };
      }
      try {
        fs.statSync(configuredPath);
        return { name, status: "ok", message: configuredPath };
      } catch (error) {
        return {
          name,
          status: required ? "error" : "warn",
          message: (error as Error).message,
        };
      }
    };
    const checks = [
      check("hpm_sdk", this.hpmSdk, true),
      ...TOOL_DEFINITIONS.map(({ name, required }) =>
        check(`${name}.exe`, this.tools[name], required),
      ),
      check("GNURISCV_TOOLCHAIN_PATH", this.env.GNURISCV_TOOLCHAIN_PATH, true),
    ];
    const sdkPathsMatch =
      path.resolve(this.env.HPM_SDK_BASE || "").toLowerCase() ===
      path.resolve(this.hpmSdk || "").toLowerCase();
    let sdkBaseMessage = this.env.HPM_SDK_BASE;
    if (!sdkBaseMessage) {
      sdkBaseMessage = "not configured";
    } else if (!sdkPathsMatch) {
      sdkBaseMessage = "does not match hpm_sdk";
    }
    checks.push({
      name: "HPM_SDK_BASE",
      status: !this.env.HPM_SDK_BASE || !sdkPathsMatch ? "error" : "ok",
      message: sdkBaseMessage,
    });
    return checks;
  }

  /** Throws aggregated required-setting errors from doctor; optional OpenOCD warnings are allowed. */
  validate(): void {
    const errors = this.doctor().filter((check) => check.status === "error");
    if (errors.length) {
      throw new Error(errors.map((check) => `${check.name}: ${check.message}`).join("; "));
    }
  }
}

/** Creates a fresh empty configuration without file access. */
export const newConfig = (): Config => new Config();

/**
 * Validates one setting: checks the SDK cmake directory or runs a tool with --version.
 * @param key Canonical setting key; also accepts toolchain, skipping unrelated keys.
 * @param value Configured path; empty values are skipped and handled by doctor.
 * @param runner Injectable runner; Python/OpenOCD version output may appear on stderr.
 * @throws On invalid paths, startup failures, nonzero exits, or empty version output.
 */
export async function validateTool(
  key: string,
  value: string,
  runner: Runner = run,
): Promise<void> {
  const canonicalKey = resolveConfigKey(key);
  key = canonicalKey;
  if (!value) {
    return;
  }
  if (key === "hpm_sdk") {
    if (!exists(value)) {
      throw new Error(`hpm_sdk path does not exist: ${value}`);
    }
    if (!fs.statSync(value).isDirectory()) {
      throw new Error(`hpm_sdk must be a directory: ${value}`);
    }
    const cmakeDirectory = path.join(value, "cmake");
    if (!exists(cmakeDirectory) || !fs.statSync(cmakeDirectory).isDirectory()) {
      throw new Error(`hpm_sdk does not contain cmake/ subdirectory: ${value}`);
    }
    return;
  }
  let executablePath = value;
  let toolName = key.slice(6);
  const acceptsStderrVersion = ["python", "openocd"].includes(toolName);
  if (["toolchain", "env.GNURISCV_TOOLCHAIN_PATH"].includes(key)) {
    toolName = "toolchain compiler";
    if (!exists(value)) {
      throw new Error(`toolchain path does not exist: ${value}`);
    }
    if (!fs.statSync(value).isDirectory()) {
      throw new Error(`toolchain must be a directory: ${value}`);
    }
    executablePath = path.join(
      value,
      "bin",
      "riscv32-unknown-elf-gcc" + (process.platform === "win32" ? ".exe" : ""),
    );
  } else if (!isToolKey(canonicalKey)) {
    return;
  }
  if (!exists(executablePath)) {
    throw new Error(`${toolName} not found at ${executablePath}`);
  }
  const versionResult = await runner(executablePath, ["--version"]);
  if (versionResult.exitCode !== 0) {
    throw new Error(
      `${toolName} exited with code ${versionResult.exitCode}: ${versionResult.stderr.trim()}`,
    );
  }
  if (!versionResult.stdout.trim() && !(acceptsStderrVersion && versionResult.stderr.trim())) {
    throw new Error(`${toolName} produced no output for --version: ${executablePath}`);
  }
}

/**
 * Converts SDK Env cmd_params.yaml to configuration without saving or validating tools.
 * Relative path entries use sdkEnv; env-value overrides env, and the toolchain defaults to gcc.
 * Tool discovery uses .exe names on all platforms.
 * @param sdkEnvDirectory SDK Env root, retained in configuration for build type discovery.
 * @returns Normalized configuration; missing tools retain candidate paths for doctor to check.
 * @throws On YAML/file errors, invalid path/env-value types, or missing HPM_SDK_BASE.
 */
function readSDKEnv(sdkEnvDirectory: string): ConfigData {
  const parametersFilePath = path.join(sdkEnvDirectory, "cmd_params.yaml");
  const parameters = parse(fs.readFileSync(parametersFilePath, "utf8")) || {};
  const resolvedPaths: Record<string, string> = {};
  for (const [key, value] of Object.entries(parameters.path || {})) {
    if (typeof value !== "string") {
      throw new Error(`invalid path value ${key}`);
    }
    resolvedPaths[key] = value
      ? path.normalize(path.isAbsolute(value) ? value : path.join(sdkEnvDirectory, value))
      : "";
  }
  // Search the root before bin; retain the first candidate if neither exists for later validation.
  const findToolExecutable = (toolDirectory: string | undefined, executableName: string) => {
    if (!toolDirectory) {
      return "";
    }
    const candidates = [
      path.join(toolDirectory, executableName),
      path.join(toolDirectory, "bin", executableName),
    ];
    return candidates.find(exists) || candidates[0];
  };
  const configuration: ConfigData = {
    hpmSdk: resolvedPaths.HPM_SDK_BASE || "",
    sdkEnv: sdkEnvDirectory,
    tools: {
      cmake: findToolExecutable(resolvedPaths.CMAKE, "cmake.exe"),
      ninja: findToolExecutable(resolvedPaths.NINJA, "ninja.exe"),
      python: findToolExecutable(resolvedPaths.PYTHON3, "python.exe"),
      openocd: findToolExecutable(resolvedPaths.OPENOCD, "openocd.exe"),
    },
    env: {},
  };
  for (const [key, value] of Object.entries(parameters.env || {})) {
    configuration.env[key] = resolveEnvironmentValue(value, resolvedPaths[key]);
  }
  for (const [key, value] of Object.entries(parameters["env-value"] || {})) {
    if (typeof value !== "string") {
      throw new Error(`invalid env-value ${key}`);
    }
    configuration.env[key] = value;
  }
  configuration.env.HPM_SDK_BASE ||= configuration.hpmSdk;
  configuration.env.HPM_SDK_TOOLCHAIN_VARIANT ||= "gcc";
  if (!configuration.hpmSdk) {
    throw new Error(`HPM_SDK_BASE is not configured in ${parametersFilePath}`);
  }
  return configuration;
}

/** Resolves an environment value or its corresponding path; arrays use the first nonempty string. */
function resolveEnvironmentValue(value: unknown, resolvedPath = ""): string {
  if (value == null || value === "") {
    return resolvedPath;
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.find((candidate) => typeof candidate === "string" && candidate !== "") || "";
  }
  return "";
}
