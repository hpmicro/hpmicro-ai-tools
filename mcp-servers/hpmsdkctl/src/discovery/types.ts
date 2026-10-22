/** Board YAML fields used for build filtering and OpenOCD default selection. */
export interface Board {
  /** SoC name used to locate IP features and module lists. */
  soc?: string;
  /** board_* capabilities provided by the board. */
  feature?: string[];
  /** Unsupported sample path prefixes. */
  excludedSamples?: string[];
  /** On-board RAM type affecting SDRAM and other build variants. */
  onBoardRam?: {
    type?: string;
  };
  /** On-board Flash type used by SDK Env build filters. */
  onBoardFlash?: {
    type?: string;
  };
  /** Default probe configuration name. */
  openocdProbe?: string;
}
/** Capabilities extracted from SoC files without running the C preprocessor. */
export interface SoC {
  /** Macro names with the HPM_IP_FEATURE_ prefix removed. */
  ip: string[];
  /** SDK module names marked =y in soc_modules.list. */
  modules: string[];
}
/** app.yaml dependencies and exclusions; entries are ANDed, with || alternatives within each entry. */
export interface App {
  dependency?: string[];
  /** Expanded keys combining HPM and CMake build types after loading. */
  excludedTargets?: string[];
  /** Secondary-core project built by the SDK while generating the primary project. */
  linkedProject?: {
    projectName?: string;
    projectPath?: string;
    buildType?: string;
  };
}
/** SDK Env build entry; filter keys are ANDed, comma-separated alternatives are ORed. */
export interface BuildEntry {
  name: string;
  filters: Record<string, string>;
}
/** One HPM build type and its supported CMake build types. */
export interface BuildType {
  hpmBuildType: string;
  cmakeBuildTypes: string[];
}
/** Application build options; empty board results are represented as null. */
export interface BuildOptions {
  /** Resolved application directory. */
  appDir: string;
  /** Boards remaining after exclusions, application dependencies, and build filters. */
  boards:
    | {
        name: string;
        buildTypes: BuildType[];
      }[]
    | null;
}
/** OpenOCD option; name omits .cfg and path identifies the actual file. */
export interface Option {
  name: string;
  path: string;
}
/** OpenOCD discovery result; missing candidates are null and unresolved defaults are empty strings. */
export interface OpenOCDInfo {
  boardName: string;
  /** SDK probe configurations sorted by name. */
  probes: Option[] | null;
  /** SDK SoC configurations sorted by name. */
  socs: Option[] | null;
  /** SDK board configurations sorted by name. */
  boards: Option[] | null;
  /** Defaults inferred from board YAML, multicore dependencies, and chip/series naming fallbacks. */
  default: {
    probe: string;
    soc: string;
    board: string;
  };
}
