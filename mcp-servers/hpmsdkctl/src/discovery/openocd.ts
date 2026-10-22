import * as path from "node:path";
import { exists, type Config } from "../config/config.js";
import type { Board, Option, OpenOCDInfo } from "./types.js";
import { listDirectoryEntries, readBoard, readApp, equalsIgnoreCase } from "./metadata.js";
/** Lists cfg files; returns null when the directory is unreadable or has no candidates. */
const listConfigOptions = (directoryPath: string): Option[] | null => {
  try {
    const options = listDirectoryEntries(directoryPath)
      .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".cfg"))
      .map((entry) => ({
        name: entry.name.slice(0, -4),
        path: path.join(directoryPath, entry.name),
      }));
    return options.length ? options : null;
  } catch {
    return null;
  }
};
/**
 * Lists OpenOCD configurations and infers probe, single/dual-core SoC, and board defaults without hardware access.
 * @param configuration SDK configuration; normalized in place.
 * @param board SDK board name or board directory path.
 * @param applicationSource Optional sample name/directory used to detect multicore dependencies.
 * @returns Candidates and defaults; unmatched boards fall back through chip and series naming rules.
 * @throws When the OpenOCD root is missing; unreadable board/application metadata uses fallback inference.
 */
export function getOpenOCDConfig(
  configuration: Config,
  board: string,
  applicationSource = "",
): OpenOCDInfo {
  configuration.normalize();
  const openocdDirectory = path.join(configuration.hpmSdk, "boards", "openocd");
  if (!exists(openocdDirectory)) {
    throw new Error(`OpenOCD config directory not found at ${openocdDirectory}`);
  }
  const isDirectoryPath = (value: string) => value.includes("/") || value.includes("\\");
  const boardName = isDirectoryPath(board) ? path.basename(board) : board;
  const boardDirectory = isDirectoryPath(board)
    ? board
    : path.join(configuration.hpmSdk, "boards", board);
  const probes = listConfigOptions(path.join(openocdDirectory, "probes"));
  const socs = listConfigOptions(path.join(openocdDirectory, "soc"));
  const boards = listConfigOptions(path.join(openocdDirectory, "boards"));
  let boardMetadata: Board | null = null;
  try {
    boardMetadata = readBoard(boardDirectory);
  } catch {
    // Unreadable board metadata uses chip/series naming fallbacks.
  }
  let applicationDirectory = "";
  if (applicationSource) {
    applicationDirectory = isDirectoryPath(applicationSource)
      ? applicationSource
      : path.join(configuration.hpmSdk, "samples", applicationSource);
  }
  let socSearchKey = "";
  if (boardMetadata?.soc) {
    socSearchKey = boardMetadata.soc.toLowerCase();
  } else if (boardName.length >= 5) {
    socSearchKey = boardName.slice(0, 5);
  }
  const matchingSocOptions = socSearchKey
    ? (socs || []).filter((socOption) => socOption.name.includes(socSearchKey))
    : [];
  let defaultSocConfig = "";
  if (matchingSocOptions.length === 1) {
    defaultSocConfig = matchingSocOptions[0].name;
  } else if (matchingSocOptions.length) {
    let requiresMulticore = false;
    try {
      requiresMulticore =
        !!applicationDirectory &&
        !!readApp(applicationDirectory)?.dependency?.some((requiredDependency) =>
          requiredDependency.includes("multicore"),
        );
    } catch {
      // Unreadable application metadata defaults to single-core selection.
    }
    defaultSocConfig =
      matchingSocOptions.find((socOption) =>
        socOption.name.includes(requiresMulticore ? "dual" : "single"),
      )?.name ||
      matchingSocOptions.find((socOption) => !socOption.name.includes("-csr"))?.name ||
      matchingSocOptions[0].name;
  }
  let defaultBoardConfig =
    (boards || []).find((boardOption) => equalsIgnoreCase(boardOption.name, boardName))?.name || "";
  if (!defaultBoardConfig && defaultSocConfig) {
    let chipName = defaultSocConfig;
    for (const suffix of ["-single-core", "-dual-core", "-csr"]) {
      if (chipName.endsWith(suffix)) {
        chipName = chipName.slice(0, -suffix.length);
      }
    }
    if (chipName.length >= 7) {
      const chipSeries = chipName.slice(0, 5) + "00";
      const chipPartNumber = chipName.slice(0, 7);
      for (const candidate of [
        chipPartNumber + "evk2",
        chipPartNumber + "evk",
        chipPartNumber + "-evk2",
        chipPartNumber + "-evk",
        chipSeries + "evk",
        chipSeries + "-evk",
        chipSeries,
      ]) {
        defaultBoardConfig =
          (boards || []).find((boardOption) => boardOption.name.includes(candidate))?.name || "";
        if (defaultBoardConfig) {
          break;
        }
      }
    }
  }
  return {
    boardName: boardName,
    probes,
    socs,
    boards,
    default: {
      probe: boardMetadata?.openocdProbe || "ft2232",
      soc: defaultSocConfig,
      board: defaultBoardConfig,
    },
  };
}
