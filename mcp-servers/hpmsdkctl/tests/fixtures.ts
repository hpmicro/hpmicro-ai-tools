import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Config } from "../src/config/config.js";
import type { Runner, RunOptions } from "../src/runner.js";
export const createTempDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), "hpmsdkctl-ts-"));
export function writeFile(filePath: string, text = ""): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
  return filePath;
}
export function createSdkFixture(rootDirectory = createTempDirectory()) {
  const sdkDirectory = path.join(rootDirectory, "sdk");
  const writeBoard = (name: string, yaml: string) => {
    const boardDirectory = path.join(sdkDirectory, "boards", name);
    writeFile(path.join(boardDirectory, "CMakeLists.txt"));
    writeFile(path.join(boardDirectory, name + ".yaml"), yaml);
    return boardDirectory;
  };
  writeBoard(
    "hpm6750evkmini",
    "board:\n  soc: HPM6750\n  feature: [board_led, board_multicore]\n  on-board-ram: {type: sdram}\n",
  );
  const applicationDirectory = path.join(sdkDirectory, "samples", "hello_world");
  writeFile(
    path.join(applicationDirectory, "CMakeLists.txt"),
    "find_package(hpm-sdk REQUIRED HINTS $ENV{HPM_SDK_BASE})",
  );
  fs.mkdirSync(path.join(sdkDirectory, "cmake"), { recursive: true });
  const configuration = new Config({
    hpmSdk: sdkDirectory,
    tools: {
      cmake: writeFile(path.join(rootDirectory, "tools", "cmake.exe")),
      ninja: writeFile(path.join(rootDirectory, "tools", "ninja.exe")),
      python: writeFile(path.join(rootDirectory, "tools", "python.exe")),
      openocd: writeFile(path.join(rootDirectory, "tools", "openocd.exe")),
    },
    env: {
      HPM_SDK_BASE: sdkDirectory,
      GNURISCV_TOOLCHAIN_PATH: path.join(rootDirectory, "toolchain"),
      HPM_SDK_TOOLCHAIN_VARIANT: "gcc",
    },
  });
  fs.mkdirSync(path.join(configuration.env.GNURISCV_TOOLCHAIN_PATH, "bin"), {
    recursive: true,
  });
  writeFile(
    path.join(
      configuration.env.GNURISCV_TOOLCHAIN_PATH,
      "bin",
      "riscv32-unknown-elf-gcc" + (process.platform === "win32" ? ".exe" : ""),
    ),
  );
  const writeOpenOCDConfig = (category: string, name: string) =>
    writeFile(path.join(sdkDirectory, "boards", "openocd", category, name + ".cfg"));
  writeOpenOCDConfig("probes", "ft2232");
  writeOpenOCDConfig("soc", "hpm6750-single-core");
  writeOpenOCDConfig("soc", "hpm6750-dual-core");
  writeOpenOCDConfig("boards", "hpm6750evkmini");
  return {
    rootDirectory,
    sdkDirectory,
    applicationDirectory,
    configuration,
    writeBoard,
    writeOpenOCDConfig,
  };
}
export function fakeRunner(exitCode = 0, stdout = "out", stderr = "err") {
  const calls: {
    executablePath: string;
    toolArguments: string[];
    executionOptions: RunOptions;
  }[] = [];
  const runner: Runner = async (executablePath, toolArguments, executionOptions = {}) => {
    calls.push({ executablePath, toolArguments, executionOptions });
    return { command: [executablePath, ...toolArguments], exitCode: exitCode, stdout, stderr };
  };
  return { calls, runner };
}
