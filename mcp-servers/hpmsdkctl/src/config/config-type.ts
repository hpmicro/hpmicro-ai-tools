import type { TOOL_DEFINITIONS } from "./config-keys.js";

/** Internal configuration values, independent of persistence and protocol naming. */
export interface ConfigData {
  /** HPM SDK root, used to locate samples, boards, and OpenOCD configurations. */
  hpmSdk: string;
  /** SDK Env root; build discovery also reads its cmd_params.yaml. */
  sdkEnv?: string;
  /** Tool executable paths; OpenOCD is needed only for flashing or debugging. */
  tools: {
    [Tool in (typeof TOOL_DEFINITIONS)[number] as Tool["required"] extends true
      ? Tool["name"]
      : never]: string;
  } & {
    [Tool in (typeof TOOL_DEFINITIONS)[number] as Tool["required"] extends false
      ? Tool["name"]
      : never]?: string;
  };
  /** Tool process environment overrides, including SDK and toolchain paths. */
  env: Record<string, string>;
}

/** Serialized configuration format shared by config.json and MCP responses. */
export interface ConfigJSON {
  /** HPM SDK root directory using the persisted field name. */
  hpm_sdk: string;
  /** Optional SDK Env directory using the persisted field name. */
  sdk_env?: string;
  /** Tool executable paths; empty optional OpenOCD paths are omitted. */
  tools: ConfigData["tools"];
  /** Tool process environment overrides using SDK-defined variable names. */
  env: Record<string, string>;
}

/** Single doctor check; warnings for optional settings do not block validate. */
export interface Check {
  /** Setting or tool name. */
  name: string;
  /** Errors indicate unavailable required settings or inconsistent SDK paths. */
  status: "ok" | "warn" | "error";
  /** Configured path or reason for failure. */
  message?: string;
}

/** Internal configuration initialization input, independent of protocol schemas. */
export interface InitInput {
  /** SDK Env installation; mutually exclusive with explicit paths. */
  sdkEnv?: string;
  /** HPM SDK root directory. */
  hpmSdk?: string;
  /** CMake executable path. */
  cmake?: string;
  /** Ninja executable path. */
  ninja?: string;
  /** Python executable path. */
  python?: string;
  /** Optional OpenOCD executable path. */
  openocd?: string;
  /** RISC-V toolchain root directory. */
  toolchain?: string;
  /** Toolchain variant; defaults to gcc. */
  toolchainVariant?: string;
}

/** Persisted configuration and the destination that was written. */
export interface SavedConfig {
  path: string;
  configuration: ConfigData;
}
