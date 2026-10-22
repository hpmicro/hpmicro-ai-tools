import { basename, isAbsolute } from "node:path";
import { stat } from "node:fs/promises";
import type { Runner } from "./runner.js";
import type { Validation } from "./types.js";

/** Checks the installed CMD name, version, failure exit behavior, and required options. */
export async function validatePath(
  path: string,
  runner: Runner,
  signal?: AbortSignal,
): Promise<Validation> {
  if (!isAbsolute(path)) {
    return {
      compatible: false,
      message: "manufacturing command path must be absolute",
    };
  }
  const expected = `hpm_manufacturing_cmd${process.platform === "win32" ? ".exe" : ""}`;
  if (basename(path).toLowerCase() !== expected) {
    return {
      compatible: false,
      message: `command file name must be ${expected}`,
    };
  }
  try {
    const info = await stat(path);
    if (!info.isFile() || (process.platform !== "win32" && !(info.mode & 0o111))) {
      throw new Error("command must be an executable file");
    }
    const version = await runner.run(path, ["--version"], 10000, signal);
    if (!version.success) {
      return { compatible: false, message: "--version failed: " + version.log };
    }
    const noArgs = await runner.run(path, [], 10000, signal);
    if (noArgs.exitCode <= 0 || noArgs.timedOut || signal?.aborted) {
      return {
        compatible: false,
        message: "command must fail with a nonzero exit code when called without arguments",
      };
    }
    const help = await runner.run(path, ["--help"], 10000, signal);
    if (
      !help.success ||
      !["-p", "-u", "-r", "-t", "-f"].every((option) => help.log.includes(option))
    ) {
      return { compatible: false, message: "missing required command options" };
    }
    return { compatible: true, version: version.log.trim() };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return { compatible: false, message: String(error) };
  }
}
