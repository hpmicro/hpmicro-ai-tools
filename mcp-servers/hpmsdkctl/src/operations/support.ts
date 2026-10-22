import type { RunResult } from "../runner.js";
import type { Output } from "./types.js";

/** Reports missing required inputs using interface-neutral field names. */
export const assertRequiredInput = (value: unknown, name: string) => {
  if (!value) {
    throw new Error(`${name} is required`);
  }
};

/** Converts runner results without turning nonzero exits into exceptions. */
export const createOutput = (
  processResult: RunResult,
  directoryContext: Pick<Output, "appDir" | "buildDir"> = {},
): Output => ({
  ...processResult,
  ok: processResult.exitCode === 0,
  ...directoryContext,
});
