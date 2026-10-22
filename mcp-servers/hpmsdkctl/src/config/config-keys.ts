/** Tool metadata shared by configuration access, diagnostics, and version checks. */
export const TOOL_DEFINITIONS = [
  { name: "cmake", key: "tools.cmake", required: true },
  { name: "ninja", key: "tools.ninja", required: true },
  { name: "python", key: "tools.python", required: true },
  { name: "openocd", key: "tools.openocd", required: false },
] as const;

/** Canonical keys include an open namespace for tool environment variables. */
export type ConfigKey = "hpm_sdk" | (typeof TOOL_DEFINITIONS)[number]["key"] | `env.${string}`;

const aliases: Record<string, ConfigKey> = Object.fromEntries([
  ...TOOL_DEFINITIONS.map(({ name, key }) => [name, key]),
  ["toolchain", "env.GNURISCV_TOOLCHAIN_PATH"],
  ["toolchain_variant", "env.HPM_SDK_TOOLCHAIN_VARIANT"],
]);

/** Resolves supported aliases and rejects unknown configuration keys. */
export function resolveConfigKey(key: string): ConfigKey {
  if (Object.hasOwn(aliases, key)) {
    return aliases[key];
  }
  if (
    key === "hpm_sdk" ||
    TOOL_DEFINITIONS.some((tool) => tool.key === key) ||
    (key.startsWith("env.") && key.length > 4)
  ) {
    return key as ConfigKey;
  }
  throw new Error(`unknown config key ${JSON.stringify(key)}`);
}

/** Identifies a tool key after canonicalization. */
export function isToolKey(key: ConfigKey): key is (typeof TOOL_DEFINITIONS)[number]["key"] {
  return TOOL_DEFINITIONS.some((tool) => tool.key === key);
}
