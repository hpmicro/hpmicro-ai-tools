import * as os from "node:os";
import * as path from "node:path";

/**
 * Resolves a stable user configuration path, preferring HPMMFGCTL_CONFIG.
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
  if (environmentVariables.HPMMFGCTL_CONFIG) {
    return environmentVariables.HPMMFGCTL_CONFIG;
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
  return path.join(configDirectory, "hpmicro", "hpmmfgctl", "config.json");
}
