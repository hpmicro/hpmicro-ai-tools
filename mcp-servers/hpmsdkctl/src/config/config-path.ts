import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
/**
 * Resolves a stable user configuration path, preferring HPMSDKCTL_CONFIG.
 * @param environmentVariables Environment providing the override and APPDATA/XDG_CONFIG_HOME.
 * @param platform Target OS; defaults to the current OS and is injectable for tests.
 * @param home User home directory for platform-specific fallback paths.
 * @returns File path; does not create files.
 */
export function defaultPath(
  environmentVariables = process.env,
  platform = process.platform,
  home = os.homedir(),
): string {
  if (environmentVariables.HPMSDKCTL_CONFIG) {
    return environmentVariables.HPMSDKCTL_CONFIG;
  }
  let configDirectory: string;
  switch (platform) {
    case "win32":
      configDirectory = environmentVariables.APPDATA || path.join(home, "AppData", "Roaming");
      break;
    case "darwin":
      configDirectory = path.join(home, "Library", "Application Support");
      break;
    default:
      configDirectory = environmentVariables.XDG_CONFIG_HOME || path.join(home, ".config");
  }
  return path.join(configDirectory, "hpmicro", "hpmsdkctl", "config.json");
}
/** Returns true when stat succeeds; missing paths and other access errors return false. */
export const exists = (configuredPath: string): boolean => {
  try {
    fs.statSync(configuredPath);
    return true;
  } catch {
    return false;
  }
};
