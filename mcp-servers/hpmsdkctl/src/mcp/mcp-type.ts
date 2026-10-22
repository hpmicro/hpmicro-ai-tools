import type * as zod from "zod/v4";
import type * as schemas from "./schemas.js";
import type { structuredResponse } from "./responses.js";

/** JSON text and structured data returned by configuration and discovery tools. */
export type StructuredToolResponse<Data extends { ok: boolean; error?: string }> = ReturnType<
  typeof structuredResponse<Data>
>;

/** Process output and MCP error status returned by execution tools. */
export type ProcessOutput = zod.infer<typeof schemas.processOutputSchema>;

/** Typed process response, including failures before a process starts. */
export type ProcessToolResponse = StructuredToolResponse<ProcessOutput>;

/** Output types derived from the schemas used by tool registration. */
export type ConfigGetOutput = zod.infer<typeof schemas.configGetOutputSchema>;
export type ConfigSavedOutput = zod.infer<typeof schemas.savedSchema>;
export type ConfigListOutput = zod.infer<typeof schemas.configListOutputSchema>;
export type ConfigDoctorOutput = zod.infer<typeof schemas.configDoctorOutputSchema>;
export type BuildOptionsOutput = zod.infer<typeof schemas.buildOptionsOutputSchema>;
export type OpenOCDConfigOutput = zod.infer<typeof schemas.openOCDConfigOutputSchema>;
export type UnlocalizeOutput = zod.infer<typeof schemas.unlocalizeOutputSchema>;

/** Validated MCP input inferred from configGetSchema. */
export type ConfigGetInput = zod.infer<typeof schemas.configGetSchema>;

/** Validated MCP input inferred from configUnsetSchema. */
export type ConfigUnsetInput = zod.infer<typeof schemas.configUnsetSchema>;

/** Validated MCP input inferred from configSetSchema. */
export type ConfigSetInput = zod.infer<typeof schemas.configSetSchema>;

/** Validated MCP input inferred from initSchema. */
export type ConfigInitInput = zod.infer<typeof schemas.initSchema>;

/** Validated MCP input inferred from buildOptionsSchema. */
export type BuildOptionsInput = zod.infer<typeof schemas.buildOptionsSchema>;

/** Validated MCP input inferred from openOCDConfigSchema. */
export type OpenOCDConfigInput = zod.infer<typeof schemas.openOCDConfigSchema>;

/** Validated MCP input inferred from generateSchema. */
export type GenerateToolInput = zod.infer<typeof schemas.generateSchema>;

/** Validated MCP input inferred from buildDirectorySchema. */
export type BuildDirectoryInput = zod.infer<typeof schemas.buildDirectorySchema>;

/** Validated MCP input inferred from flashSchema. */
export type FlashToolInput = zod.infer<typeof schemas.flashSchema>;

/** Validated MCP input inferred from gdbSchema. */
export type GDBServerInput = zod.infer<typeof schemas.gdbSchema>;

/** Validated MCP input inferred from unlocalizeSchema. */
export type UnlocalizeInput = zod.infer<typeof schemas.unlocalizeSchema>;
