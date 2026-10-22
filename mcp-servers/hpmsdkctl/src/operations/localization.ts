import * as fs from "node:fs";
import * as path from "node:path";
import { exists, type Config } from "../config/config.js";
import { run, type Runner, type RunOptions } from "../runner.js";
import { assertRequiredInput, createOutput } from "./support.js";
import type { Output } from "./types.js";
/**
 * Runs Ninja's localize_sdk target to remove the application's external SDK dependency.
 * Uses CMakeCache to locate the source and prevent repeated localization; unreadable cache is tolerated.
 * Does not copy the SDK directly; the SDK's Ninja target performs the file changes.
 */
export async function localize(
  configuration: Config,
  buildDirectory: string,
  executionOptions: RunOptions = {},
  runner: Runner = run,
): Promise<Output> {
  assertRequiredInput(buildDirectory, "buildDir");
  if (!exists(path.join(buildDirectory, "build.ninja"))) {
    throw new Error(`build.ninja is not found in ${buildDirectory}`);
  }
  let sourceDirectory = "";
  try {
    const sourceDirectoryEntry = fs
      .readFileSync(path.join(buildDirectory, "CMakeCache.txt"), "utf8")
      .split("\n")
      .find((cacheLine) => cacheLine.startsWith("CMAKE_HOME_DIRECTORY:INTERNAL="));
    sourceDirectory = sourceDirectoryEntry?.slice("CMAKE_HOME_DIRECTORY:INTERNAL=".length) || "";
  } catch {
    // Cache lookup is best-effort; Ninja remains responsible for the localization target.
  }
  if (sourceDirectory && exists(path.join(sourceDirectory, "CMakeLists.txt.localized.bak"))) {
    throw new Error(
      `project is already localized (CMakeLists.txt.localized.bak exists in ${sourceDirectory}); unlocalize first`,
    );
  }
  return createOutput(
    await runner(configuration.tools.ninja, ["localize_sdk"], {
      ...executionOptions,
      cwd: buildDirectory,
      env: configuration.environment(),
    }),
    { buildDir: buildDirectory },
  );
}
/**
 * Restores CMakeLists.txt from .localized.bak, saving the current file as .unlocalized.bak.
 * Overwrites an existing .unlocalized.bak; the two renames are not atomic and failures throw.
 * Restores only the build entry point, leaving previously copied SDK files untouched.
 */
export function unlocalize(applicationDirectory: string): {
  localizedDir: string;
  ok: boolean;
} {
  assertRequiredInput(applicationDirectory, "localizedDir");
  if (!exists(applicationDirectory)) {
    throw new Error(`sample directory ${JSON.stringify(applicationDirectory)} does not exist`);
  }
  if (!fs.statSync(applicationDirectory).isDirectory()) {
    throw new Error(`${JSON.stringify(applicationDirectory)} is not a directory`);
  }
  const localizedBackupPath = path.join(applicationDirectory, "CMakeLists.txt.localized.bak");
  if (!exists(localizedBackupPath)) {
    throw new Error(
      `CMakeLists.txt.localized.bak not found in ${applicationDirectory}; project is not localized`,
    );
  }
  const replaceFile = (sourcePath: string, targetPath: string) => {
    if (exists(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.renameSync(sourcePath, targetPath);
  };
  replaceFile(
    path.join(applicationDirectory, "CMakeLists.txt"),
    path.join(applicationDirectory, "CMakeLists.txt.unlocalized.bak"),
  );
  replaceFile(localizedBackupPath, path.join(applicationDirectory, "CMakeLists.txt"));
  return { localizedDir: applicationDirectory, ok: true };
}
