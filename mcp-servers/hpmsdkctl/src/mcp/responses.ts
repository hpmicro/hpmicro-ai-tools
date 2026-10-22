import type { Output } from "../operations/types.js";
import type { ProcessOutput } from "./mcp-type.js";

/** Converts an unknown exception to a user-facing protocol error message. */
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Provides structured data, readable text, and consistent MCP error status. */
export function structuredResponse<Data extends { ok: boolean; error?: string }>(
  responseData: Data,
  text = JSON.stringify(responseData),
) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: responseData,
    isError: !responseData.ok,
  };
}

/** Formats process results and precondition failures without inventing exit codes. */
export const processResponse = async (operation: () => Promise<Output>) => {
  try {
    const result = await operation();
    const ok = result.exitCode === 0;
    const output: ProcessOutput = {
      ok,
      ...(!ok ? { error: `tool exited with code ${result.exitCode}` } : {}),
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      ...(result.appDir !== undefined ? { app_dir: result.appDir } : {}),
      ...(result.buildDir !== undefined ? { build_dir: result.buildDir } : {}),
      ...(result.workDir !== undefined ? { work_dir: result.workDir } : {}),
    };
    const text = result.stdout + (result.stderr ? (result.stdout ? "\n" : "") + result.stderr : "");
    return structuredResponse(output, text || output.error || JSON.stringify(output));
  } catch (error) {
    const output: ProcessOutput = {
      ok: false,
      error: errorMessage(error),
      exit_code: null,
      stdout: "",
      stderr: "",
    };
    return structuredResponse(output, output.error);
  }
};
