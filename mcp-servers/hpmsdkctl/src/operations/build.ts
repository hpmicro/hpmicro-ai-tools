import * as fs from "node:fs";
import * as path from "node:path";
import { exists, type Config } from "../config/config.js";
import { run, type Runner, type RunOptions } from "../runner.js";
import { assertRequiredInput, createOutput } from "./support.js";
import type { GenerateInput, Output } from "./types.js";
import { parse } from "yaml";
import { resolveApplicationDirectory } from "../discovery/metadata.js";
/**
 * Validates the application/board and generates a Ninja project using CMake.
 * @param configuration Toolchain configuration; normalized in place without saving.
 * @param input Generation request; clean recursively deletes the selected directory before CMake runs.
 * @param executionOptions Execution context; env is replaced by the configuration-derived environment.
 * @param runner Injectable tool runner.
 * @returns Captured result and application/build paths; tool failures use ok/exitCode.
 * @throws On invalid inputs/files, directory errors, startup failure, or cancellation.
 */
export async function generate(
  configuration: Config,
  input: GenerateInput,
  executionOptions: RunOptions = {},
  runner: Runner = run,
): Promise<Output> {
  if (!input.sample && !input.appDir) {
    throw new Error("sample or appDir is required");
  }
  if (input.sample && input.appDir) {
    throw new Error("sample and appDir cannot be used together");
  }
  if (input.board && input.customBoard) {
    throw new Error("board and customBoard cannot be used together");
  }
  if (!input.board && !input.customBoard) {
    throw new Error("board or customBoard is required");
  }
  assertRequiredInput(input.hpmBuildType, "hpmBuildType");
  assertRequiredInput(input.cmakeBuildType, "cmakeBuildType");
  configuration.normalize();
  const applicationDirectory = resolveApplicationDirectory(
    input.appDir
      ? path.resolve(input.appDir)
      : path.join(configuration.hpmSdk, "samples", input.sample!),
  );
  const cmakeFilePath = path.join(applicationDirectory, "CMakeLists.txt");
  if (!exists(cmakeFilePath)) {
    throw new Error(`CMakeLists.txt is not found in ${applicationDirectory}`);
  }
  const cmakeContents = fs.readFileSync(cmakeFilePath, "utf8");
  if (
    !["find_package", "hpm-sdk", "HPM_SDK_BASE"].every((requiredToken) =>
      cmakeContents.includes(requiredToken),
    )
  ) {
    throw new Error(
      "CMakeLists.txt does not look like an HPM SDK application: missing find_package(hpm-sdk ... HPM_SDK_BASE)",
    );
  }
  let board = input.board || "";
  if (input.customBoard) {
    const customBoardDirectory = input.customBoard;
    if (!exists(customBoardDirectory)) {
      throw new Error(`custom board path ${JSON.stringify(customBoardDirectory)} does not exist`);
    }
    if (!fs.statSync(customBoardDirectory).isDirectory()) {
      throw new Error(
        `custom board path ${JSON.stringify(customBoardDirectory)} is not a directory`,
      );
    }
    board = path.basename(customBoardDirectory);
    if (!exists(path.join(customBoardDirectory, "CMakeLists.txt"))) {
      throw new Error(`CMakeLists.txt not found in custom board directory ${customBoardDirectory}`);
    }
    const boardYamlPath = path.join(customBoardDirectory, board + ".yaml");
    if (!exists(boardYamlPath)) {
      throw new Error(`${board}.yaml not found in custom board directory ${customBoardDirectory}`);
    }
    if (!parse(fs.readFileSync(boardYamlPath, "utf8"))?.board?.soc) {
      throw new Error(`custom board yaml ${boardYamlPath} is missing board.soc field`);
    }
  } else if (!exists(path.join(configuration.hpmSdk, "boards", board))) {
    throw new Error(`board ${JSON.stringify(board)} is not valid`);
  }
  const buildDirectory =
    input.buildDir ||
    path.join(applicationDirectory, `${board}_${input.hpmBuildType}_${input.cmakeBuildType}`);
  if (input.clean) {
    fs.rmSync(buildDirectory, { recursive: true, force: true });
  }
  fs.mkdirSync(buildDirectory, { recursive: true });
  const cmakeArguments = [
    "-GNinja",
    "-DBOARD=" + board,
    "-DHPM_BUILD_TYPE=" + input.hpmBuildType,
    "-DCMAKE_BUILD_TYPE=" + input.cmakeBuildType,
    "-B",
    buildDirectory,
  ];
  if (input.customBoard) {
    cmakeArguments.push("-DBOARD_SEARCH_PATH=" + path.dirname(input.customBoard));
  }
  if (input.customGccLinkerFile) {
    const linkerFilePath = input.customGccLinkerFile;
    if (!exists(linkerFilePath)) {
      throw new Error(`custom gcc linker file ${JSON.stringify(linkerFilePath)} does not exist`);
    }
    if (fs.statSync(linkerFilePath).isDirectory()) {
      throw new Error(
        `custom gcc linker file ${JSON.stringify(linkerFilePath)} is a directory, not a file`,
      );
    }
    cmakeArguments.push("-DCUSTOM_GCC_LINKER_FILE=" + linkerFilePath);
  }
  cmakeArguments.push(applicationDirectory);
  return createOutput(
    await runner(configuration.tools.cmake, cmakeArguments, {
      ...executionOptions,
      env: configuration.environment(),
    }),
    { appDir: applicationDirectory, buildDir: buildDirectory },
  );
}
/** Runs Ninja in a directory containing build.ninja without regenerating the project. */
export async function compile(
  configuration: Config,
  buildDirectory: string,
  executionOptions: RunOptions = {},
  runner: Runner = run,
): Promise<Output> {
  assertRequiredInput(buildDirectory, "buildDir");
  if (!exists(path.join(buildDirectory, "build.ninja"))) {
    throw new Error(`build.ninja is not found in ${buildDirectory}`);
  }
  return createOutput(
    await runner(configuration.tools.ninja, [], {
      ...executionOptions,
      cwd: buildDirectory,
      env: configuration.environment(),
    }),
    { buildDir: buildDirectory },
  );
}
