import type { RunResult } from "../runner.js";

/** CMake request; select exactly one application source and one board source. */
export interface GenerateInput {
  /** Sample path under SDK samples; mutually exclusive with appDir. */
  sample?: string;
  /** External application directory; mutually exclusive with sample. */
  appDir?: string;
  /** SDK board name; mutually exclusive with customBoard. */
  board?: string;
  /** Custom board directory containing CMakeLists.txt and matching board YAML. */
  customBoard?: string;
  /** SDK build type, such as ram or flash_xip. */
  hpmBuildType: string;
  /** CMake build type, such as debug or release. */
  cmakeBuildType: string;
  /** Custom GCC linker script path. */
  customGccLinkerFile?: string;
  /** Output directory; defaults to an application subdirectory named for board and build types. */
  buildDir?: string;
  /** Recursively deletes buildDir before generation; callers must confirm the target is safe to clear. */
  clean?: boolean;
}

/** Flash request; configurations accept SDK names or cfg paths, and file identifies the firmware. */
export interface FlashInput {
  /** Debug probe configuration. */
  probe: string;
  /** SoC configuration including the required single/dual-core variant. */
  soc: string;
  /** Board OpenOCD configuration. */
  board: string;
  /** Firmware path passed as data to OpenOCD's program command. */
  file: string;
  /** Explicit flash address; required for BIN firmware and never inferred. */
  address?: string;
}

/** GDB server request; configures OpenOCD without starting a GDB client. */
export interface GDBInput {
  /** Probe configuration name or cfg path. */
  probe: string;
  /** SoC configuration name or cfg path. */
  soc: string;
  /** Board configuration name or cfg path. */
  board: string;
}

/** Operation result retaining the command, output, and exit code with directory context. */
export type Output = RunResult & {
  /** True only when the tool exits with code 0. */
  ok: boolean;
  /** Application directory used for generation. */
  appDir?: string;
  /** Build directory used for this operation. */
  buildDir?: string;
};
