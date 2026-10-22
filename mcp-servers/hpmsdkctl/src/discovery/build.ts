import * as fs from "node:fs";
import * as path from "node:path";
import { exists, type Config } from "../config/config.js";
import type { App, Board, SoC, BuildEntry, BuildOptions } from "./types.js";
import {
  listDirectoryEntries,
  readYAML,
  readBoard,
  readApp,
  resolveApplicationDirectory,
  equalsIgnoreCase,
} from "./metadata.js";

/** Finds SoC capabilities; missing directories return null, unreadable capability files yield empty lists. */
function readSoC(sdkDirectory: string, socName: string): SoC | null {
  let matchingSocDirectories: string[];
  try {
    matchingSocDirectories = listDirectoryEntries(path.join(sdkDirectory, "soc"))
      .map((directoryEntry) => path.join(sdkDirectory, "soc", directoryEntry.name, socName))
      .filter(exists);
  } catch {
    return null;
  }
  if (!matchingSocDirectories.length) {
    return null;
  }
  const result: SoC = { ip: [], modules: [] };
  try {
    for (const line of fs
      .readFileSync(path.join(matchingSocDirectories[0], "hpm_soc_ip_feature.h"), "utf8")
      .split("\n")) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("#define HPM_IP_FEATURE_")) {
        const macroName = trimmedLine.split(/\s+/)[1];
        if (macroName) {
          result.ip.push(macroName.slice("HPM_IP_FEATURE_".length));
        }
      }
    }
  } catch {
    // IP capability metadata is optional; missing files leave the list empty.
  }
  try {
    for (const line of fs
      .readFileSync(path.join(matchingSocDirectories[0], "soc_modules.list"), "utf8")
      .split("\n")) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("HPMSOC_HAS_HPMSDK_") && trimmedLine.endsWith("=y")) {
        const moduleName = trimmedLine.slice("HPMSOC_HAS_HPMSDK_".length, -2);
        if (moduleName) {
          result.modules.push(moduleName);
        }
      }
    }
  } catch {
    // Module metadata is optional; missing files leave the list empty.
  }
  return result;
}

/** Checks SoC capability names without depending on SDK metadata capitalization. */
function includesIgnoreCase(values: string[] | undefined, expected: string): boolean {
  return !!values?.some((value) => equalsIgnoreCase(value, expected));
}

/** Checks one board_*, ip_feature_*, module, or SoC dependency without parsing || expressions. */
function matchesDependency(
  requiredDependency: string,
  board: Board,
  socCapabilities: SoC | null,
): boolean {
  if (requiredDependency.startsWith("board_")) {
    return (board.feature || []).includes(requiredDependency);
  }
  if (requiredDependency.startsWith("ip_feature_")) {
    return includesIgnoreCase(socCapabilities?.ip, requiredDependency.slice(11));
  }
  return (
    includesIgnoreCase(socCapabilities?.modules, requiredDependency) ||
    equalsIgnoreCase(board.soc || "", requiredDependency)
  );
}

/** Default build definitions used when SDK Env definitions are unavailable. */
const defaultBuildEntries: BuildEntry[] = [
  { name: "ram", filters: {} },
  { name: "flash_xip", filters: {} },
  { name: "flash_sdram_xip", filters: { onBoardRam: "sdram" } },
  { name: "flash_uf2", filters: {} },
  { name: "flash_sdram_uf2", filters: { onBoardRam: "sdram" } },
  { name: "sec_core_img", filters: { feature: "multicore" } },
  { name: "flash_xip_hybrid", filters: { feature: "hybrid_xpi" } },
];

/** Prefers SDK Env definitions; falls back when loading fails or no HPM types are defined. */
function loadBuildDefinitions(sdkEnvDirectory?: string): {
  hpm: BuildEntry[];
  cmake: string[];
} {
  if (sdkEnvDirectory) {
    try {
      const raw = readYAML(path.join(sdkEnvDirectory, "cmd_params.yaml"));
      if (Object.keys(raw["hpm-build-type"] || {}).length) {
        const hpm = Object.entries(raw["hpm-build-type"]).map(([name, definition]) => {
          const filters: Record<string, string> = {};
          if (definition && typeof definition === "object" && !Array.isArray(definition)) {
            for (const [filterKey, filterValue] of Object.entries(definition)) {
              let internalKey = filterKey;
              if (filterKey === "on-board-ram") {
                internalKey = "onBoardRam";
              } else if (filterKey === "on-board-flash") {
                internalKey = "onBoardFlash";
              }
              if (typeof filterValue === "string" && filterValue !== "~") {
                filters[internalKey] = filterValue;
              } else if (Array.isArray(filterValue)) {
                filters[internalKey] = filterValue
                  .filter((candidate) => typeof candidate === "string")
                  .join(",");
              }
            }
          }
          return { name, filters };
        });
        return { hpm, cmake: raw["cmake-build-type"] || [] };
      }
    } catch {
      // Invalid SDK Env build definitions fall back to the built-in defaults.
    }
  }
  return { hpm: defaultBuildEntries, cmake: ["debug", "release"] };
}

/** Checks memory/Flash and feature filters; unknown keys are ignored. */
function matchesBuildFilters(
  filters: Record<string, string>,
  board: Board,
  socCapabilities: SoC | null,
): boolean {
  return Object.entries(filters).every(([key, value]) => {
    if (key === "onBoardRam" || key === "onBoardFlash") {
      const boardMemoryType = board[key]?.type || "";
      return (
        !value ||
        (!!boardMemoryType &&
          value
            .split(",")
            .some((candidateType) => equalsIgnoreCase(candidateType.trim(), boardMemoryType)))
      );
    }
    if (key === "feature") {
      return value.split(",").some((feature) => {
        feature = feature.trim();
        if (!feature) {
          return false;
        }
        if (feature.startsWith("board_") || feature.startsWith("ip_feature_")) {
          return matchesDependency(feature, board, socCapabilities);
        }
        return (
          includesIgnoreCase(socCapabilities?.modules, feature) ||
          (board.feature || []).includes("board_" + feature) ||
          includesIgnoreCase(socCapabilities?.ip, feature)
        );
      });
    }
    return true;
  });
}

/**
 * Discovers supported boards and build combinations by reading SDK files, without running CMake.
 * @param configuration Configuration; normalized in place, with optional sdk_env build definitions.
 * @param sample Relative path under SDK samples.
 * @param applicationDirectory External application directory; takes precedence over sample, though CLI rejects both.
 * @returns Combinations sorted by board name; boards is null when no boards match.
 * @throws On missing SDK/application input, missing application, or required directory errors; bad board YAML is skipped.
 */
export function getBuildOptions(
  configuration: Config,
  sample = "",
  applicationDirectory = "",
): BuildOptions {
  configuration.normalize();
  if (!configuration.hpmSdk) {
    throw new Error("hpm_sdk is not configured");
  }
  if (applicationDirectory) {
    applicationDirectory = path.resolve(applicationDirectory);
  } else if (sample) {
    applicationDirectory = path.join(configuration.hpmSdk, "samples", sample);
  } else {
    throw new Error("sample or appDir is required");
  }
  if (!exists(applicationDirectory)) {
    throw new Error(`app directory not found: ${applicationDirectory}`);
  }
  applicationDirectory = resolveApplicationDirectory(applicationDirectory);
  const application = readApp(applicationDirectory);
  let linkedApplication: App | null = null;
  if (application?.linkedProject) {
    const linkedProject = application.linkedProject;
    let linkedApplicationDirectory = "";
    if (linkedProject.projectPath) {
      linkedApplicationDirectory = path.resolve(applicationDirectory, linkedProject.projectPath);
    } else if (linkedProject.projectName) {
      linkedApplicationDirectory = path.join(
        configuration.hpmSdk,
        "samples",
        linkedProject.projectName,
      );
    }
    if (!linkedApplicationDirectory || !exists(linkedApplicationDirectory)) {
      throw new Error(`linked app directory not found: ${linkedApplicationDirectory}`);
    }
    linkedApplication = readApp(resolveApplicationDirectory(linkedApplicationDirectory));
  }
  const requiredDependencies = [application, linkedApplication].flatMap(
    (app) => app?.dependency || [],
  );
  const buildDefinitions = loadBuildDefinitions(configuration.sdkEnv);
  const relativeApplicationPath = path
    .relative(configuration.hpmSdk, applicationDirectory)
    .split(path.sep)
    .join("/");
  const boards: NonNullable<BuildOptions["boards"]> = [];
  for (const directoryEntry of listDirectoryEntries(path.join(configuration.hpmSdk, "boards"))) {
    if (!directoryEntry.isDirectory()) {
      continue;
    }
    const boardDirectory = path.join(configuration.hpmSdk, "boards", directoryEntry.name);
    if (
      !exists(path.join(boardDirectory, "CMakeLists.txt")) ||
      !exists(path.join(boardDirectory, directoryEntry.name + ".yaml"))
    ) {
      continue;
    }
    let boardMetadata: Board;
    try {
      boardMetadata = readBoard(boardDirectory);
    } catch {
      continue;
    }
    // Match sample path prefixes with and without the samples/ prefix, not complete path components.
    if (
      (boardMetadata.excludedSamples || []).some(
        (excludedPrefix) =>
          relativeApplicationPath.startsWith(excludedPrefix) ||
          relativeApplicationPath.startsWith(
            excludedPrefix.startsWith("samples/") ? excludedPrefix.slice(8) : excludedPrefix,
          ) ||
          ("samples/" + relativeApplicationPath).startsWith(excludedPrefix),
      )
    ) {
      continue;
    }
    const socCapabilities = boardMetadata.soc
      ? readSoC(configuration.hpmSdk, boardMetadata.soc)
      : null;
    if (
      !requiredDependencies.every((requiredDependency) =>
        requiredDependency.includes("||")
          ? requiredDependency
              .split("||")
              .some((alternativeDependency) =>
                matchesDependency(alternativeDependency.trim(), boardMetadata, socCapabilities),
              )
          : matchesDependency(requiredDependency.trim(), boardMetadata, socCapabilities),
      )
    ) {
      continue;
    }
    const linkedBuildType = application?.linkedProject?.buildType;
    if (linkedBuildType) {
      const linkedBuildEntry = buildDefinitions.hpm.find(
        (buildEntry) => buildEntry.name === linkedBuildType,
      );
      if (
        !linkedBuildEntry ||
        !matchesBuildFilters(linkedBuildEntry.filters, boardMetadata, socCapabilities)
      ) {
        continue;
      }
    }
    const supportedBuildTypes = buildDefinitions.hpm
      .filter((buildEntry) =>
        matchesBuildFilters(buildEntry.filters, boardMetadata, socCapabilities),
      )
      .map((buildEntry) => ({
        hpmBuildType: buildEntry.name,
        cmakeBuildTypes: buildDefinitions.cmake.filter(
          (cmakeBuildType) =>
            !(application?.excludedTargets || []).includes(buildEntry.name + "_" + cmakeBuildType),
        ),
      }))
      .filter((buildType) => buildType.cmakeBuildTypes.length);
    if (supportedBuildTypes.length) {
      boards.push({ name: directoryEntry.name, buildTypes: supportedBuildTypes });
    }
  }
  return { appDir: applicationDirectory, boards: boards.length ? boards : null };
}
