import type { Target, Validation } from "./command/types.js";

/** Connection settings and deadline used when probing a new ROM target. */
export interface TargetCreateInput extends Target {
  /** Probe timeout in milliseconds; defaults to 10000. */
  timeoutMs?: number;
}

/** Successful compatibility result cached for one installed executable identity. */
export interface CachedValidation {
  /** Normalized path, size, and modification metadata used to detect replacement. */
  key: string;
  /** Successful executable compatibility checks. */
  validation: Validation;
}
