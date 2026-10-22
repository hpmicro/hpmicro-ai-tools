import * as fs from "node:fs";
import * as path from "node:path";
import { defaultPath, Config } from "./config.js";
/**
 * Persists configuration at a fixed file path without caching configuration data.
 * Construction performs no file access; each load reads the latest file contents.
 */
export class ConfigStore {
  /** Configuration file path resolved when the store is constructed. */
  constructor(public readonly filePath: string = defaultPath()) {}

  /**
   * Reads configuration and supplies defaults for omitted fields.
   * Returns an empty configuration when the file does not exist, without writing.
   * @throws On invalid JSON, invalid field values, or file access errors.
   */
  load(): Config {
    let configContents: string;
    try {
      configContents = fs.readFileSync(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      return new Config();
    }
    return Config.fromJSON(JSON.parse(configContents));
  }

  /**
   * Creates parent directories and overwrites formatted configuration JSON.
   * @returns The configuration file path.
   */
  save(configuration: Config): string {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(configuration.toJSON(), null, 2) + "\n", {
      mode: 0o644,
    });
    return this.filePath;
  }
}
