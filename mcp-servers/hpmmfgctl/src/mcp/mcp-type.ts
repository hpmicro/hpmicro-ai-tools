import type { z as zod } from "zod";
import type { romSchemas } from "./schemas.js";

/** ROM operation names used by registration, timeout selection, and command building. */
export type ROMName = keyof typeof romSchemas;

/** Validated ROM input inferred from the schemas used to register MCP tools. */
export type ROMInput = zod.infer<(typeof romSchemas)[ROMName]>;

/** Parsed ROM request and the single ROM command string passed to CMD. */
export interface ROMCommand {
  input: ROMInput;
  command: string;
}
