import * as fs from "node:fs";
import * as path from "node:path";
import { exists } from "../config/config.js";
import type { Board, App } from "./types.js";
import { parse } from "yaml";
/** Sorts directory entries by name for filesystem-independent discovery order. */
export const listDirectoryEntries = (directoryPath: string) =>
  fs.readdirSync(directoryPath, { withFileTypes: true }).sort((leftEntry, rightEntry) => {
    if (leftEntry.name < rightEntry.name) {
      return -1;
    }
    if (leftEntry.name > rightEntry.name) {
      return 1;
    }
    return 0;
  });
/** Parses YAML synchronously; empty documents become objects, and read/parse errors propagate. */
export const readYAML = (yamlFilePath: string) =>
  parse(fs.readFileSync(yamlFilePath, "utf8")) || {};
/** Reads the board node from the directory's matching YAML file. */
export function readBoard(directoryPath: string): Board {
  const rawBoard =
    readYAML(path.join(directoryPath, path.basename(directoryPath) + ".yaml")).board || {};
  return {
    soc: rawBoard.soc,
    feature: rawBoard.feature,
    excludedSamples: rawBoard.excluded_samples,
    onBoardRam: rawBoard["on-board-ram"],
    onBoardFlash: rawBoard["on-board-flash"],
    openocdProbe: rawBoard["openocd-probe"],
  };
}
/** Reads optional app.yaml and expands exclusion shorthand; missing files return null, invalid YAML throws. */
export function readApp(applicationDirectory: string): App | null {
  const appYamlPath = path.join(applicationDirectory, "app.yaml");
  if (!exists(appYamlPath)) {
    return null;
  }
  const rawApplication = readYAML(appYamlPath);
  const application: App = { dependency: rawApplication.dependency };
  application.excludedTargets = (rawApplication.excluded_targets || []).map(
    (excludedTarget: string) => {
      if (excludedTarget.startsWith("debug") || excludedTarget.startsWith("release")) {
        return "ram_" + excludedTarget;
      }
      if (!excludedTarget.endsWith("debug") && !excludedTarget.endsWith("release")) {
        return excludedTarget + "_debug";
      }
      return excludedTarget;
    },
  );
  const rawLinkedProject = rawApplication.linked_project;
  if (
    rawLinkedProject &&
    typeof rawLinkedProject === "object" &&
    !Array.isArray(rawLinkedProject)
  ) {
    application.linkedProject = {
      projectName:
        typeof rawLinkedProject.project_name === "string"
          ? rawLinkedProject.project_name
          : undefined,
      projectPath:
        typeof rawLinkedProject.project_path === "string"
          ? rawLinkedProject.project_path
          : undefined,
      buildType:
        typeof rawLinkedProject.build_type === "string" ? rawLinkedProject.build_type : undefined,
    };
  }
  return application;
}

/** Resolves a buildable application or a linked-project container's primary core. */
export function resolveApplicationDirectory(candidateDirectory: string): string {
  if (exists(path.join(candidateDirectory, "CMakeLists.txt"))) {
    return candidateDirectory;
  }
  const primaryCoreDirectory = path.join(candidateDirectory, "core0");
  if (
    exists(path.join(primaryCoreDirectory, "CMakeLists.txt")) &&
    readApp(primaryCoreDirectory)?.linkedProject
  ) {
    return primaryCoreDirectory;
  }
  throw new Error(`CMakeLists.txt is not found in ${candidateDirectory}`);
}
/** Compares metadata names case-insensitively. */
export const equalsIgnoreCase = (leftName: string, rightName: string) =>
  leftName.toLowerCase() === rightName.toLowerCase();
