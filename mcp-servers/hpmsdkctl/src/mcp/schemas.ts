import * as zod from "zod/v4";
import type { ConfigData, ConfigJSON } from "../config/config-type.js";
export const optionalStringSchema = zod.string().optional();

/** MCP initialization fields; the adapter maps these to the internal configuration input. */
export const initSchema = zod.object({
  sdk_env: optionalStringSchema,
  hpm_sdk: optionalStringSchema,
  cmake: optionalStringSchema,
  ninja: optionalStringSchema,
  python: optionalStringSchema,
  openocd: optionalStringSchema,
  toolchain: optionalStringSchema,
  toolchain_variant: optionalStringSchema,
});

/** Generation input; operation validation requires exactly one board source. */
export const generateSchema = zod.object({
  sample: optionalStringSchema,
  app_dir: optionalStringSchema,
  board: optionalStringSchema,
  custom_board: optionalStringSchema,
  hpm_build_type: zod.string(),
  cmake_build_type: zod.string(),
  custom_gcc_linker_file: optionalStringSchema,
  build_dir: optionalStringSchema,
  clean: zod.boolean().optional(),
});
/** OpenOCD input shared by GDB server and flash operations. */
export const gdbSchema = zod.object({
  probe: zod.string(),
  soc: zod.string(),
  board: zod.string(),
});
/** Configured executable paths; an empty optional OpenOCD path may be omitted. */
export const configuredToolsSchema = zod.object({
  cmake: zod.string(),
  ninja: zod.string(),
  python: zod.string(),
  openocd: optionalStringSchema,
}) satisfies zod.ZodType<ConfigData["tools"]>;

/** Serialized configuration consistent with Config.toJSON() omission rules. */
export const configSchema = zod.object({
  hpm_sdk: zod.string(),
  sdk_env: optionalStringSchema,
  tools: configuredToolsSchema,
  env: zod.record(zod.string(), zod.string()),
}) satisfies zod.ZodType<ConfigJSON>;
export const statusSchema = { ok: zod.boolean(), error: optionalStringSchema };
export const savedSchema = zod.object({
  ...statusSchema,
  path: zod.string(),
  config: configSchema.nullable(),
});
export const optionSchema = zod.object({ name: zod.string(), path: zod.string() });

/** Input schema for configGet. */
export const configGetSchema = zod.object({ key: zod.string() });

/** Input schema for clearing one persisted configuration value. */
export const configUnsetSchema = configGetSchema;

/** Input schema for configSet. */
export const configSetSchema = zod.object({ key: zod.string(), value: zod.string() });

/** Input schema for emptyInput. */
export const emptyInputSchema = zod.object({});

/** Input schema for buildOptions. */
export const buildOptionsSchema = zod.object({
  sample: optionalStringSchema,
  app_dir: optionalStringSchema,
});

/** Input schema for openOCDConfig. */
export const openOCDConfigSchema = zod.object({ board: zod.string(), app: optionalStringSchema });

/** Input schema for buildDirectory. */
export const buildDirectorySchema = zod.object({ build_dir: zod.string() });

/** Input schema for flash. */
export const flashSchema = gdbSchema.extend({ file: zod.string(), address: optionalStringSchema });

/** Input schema for unlocalize. */
export const unlocalizeSchema = zod.object({ localized_dir: zod.string() });

/** Configuration lookup result, including the requested key on failure. */
export const configGetOutputSchema = zod.object({
  ...statusSchema,
  key: zod.string(),
  value: zod.string(),
});

/** Full configuration result; failed reads return null configuration. */
export const configListOutputSchema = zod.object({
  ...statusSchema,
  config: configSchema.nullable(),
});

/** One diagnostic check; status remains a string to preserve the protocol contract. */
export const diagnosticCheckSchema = zod.object({
  name: zod.string(),
  status: zod.string(),
  message: optionalStringSchema,
});

/** Diagnostic results; failed reads return null checks. */
export const configDoctorOutputSchema = zod.object({
  ...statusSchema,
  checks: zod.array(diagnosticCheckSchema).nullable(),
});

/** HPM build type and its supported CMake configurations. */
export const buildTypeSchema = zod.object({
  hpm_build_type: zod.string(),
  cmake_build_types: zod.array(zod.string()).nullable(),
});

/** Board and the build types available for the selected application. */
export const boardBuildOptionsSchema = zod.object({
  name: zod.string(),
  build_types: zod.array(buildTypeSchema).nullable(),
});

/** Build capabilities discovered for an application. */
export const buildOptionsOutputSchema = zod.object({
  ...statusSchema,
  app_dir: zod.string().nullable(),
  boards: zod.array(boardBuildOptionsSchema).nullable(),
});

/** Inferred OpenOCD selections; unresolved selections remain empty strings. */
export const openOCDDefaultsSchema = zod.object({
  probe: zod.string(),
  soc: zod.string(),
  board: zod.string(),
});

/** SDK configuration candidates and optional inferred defaults for a board. */
export const openOCDConfigOutputSchema = zod.object({
  ...statusSchema,
  board_name: zod.string(),
  probes: zod.array(optionSchema).nullable(),
  socs: zod.array(optionSchema).nullable(),
  boards: zod.array(optionSchema).nullable(),
  default: openOCDDefaultsSchema.optional(),
});

/** Localization restoration status and the application directory involved. */
export const unlocalizeOutputSchema = zod.object({
  ...statusSchema,
  localized_dir: zod.string(),
});

/** Process outcome; null exit_code means no process result was available. */
export const processOutputSchema = zod.object({
  ...statusSchema,
  exit_code: zod.number().int().nullable(),
  stdout: zod.string(),
  stderr: zod.string(),
  app_dir: optionalStringSchema,
  build_dir: optionalStringSchema,
  work_dir: optionalStringSchema,
});
