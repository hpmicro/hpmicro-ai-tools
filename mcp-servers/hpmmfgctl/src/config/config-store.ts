import { mkdir, readFile, rename, unlink, open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import type { Config } from "./config-type.js";
import { defaultPath } from "./config-path.js";

/** Persists configuration at a stable per-user path without caching file contents. */
export class Store {
  /** Uses the supplied file path or the platform default resolved by defaultPath. */
  constructor(readonly filePath = defaultPath()) {}

  /** Returns the resolved configuration file path. */
  path(): string {
    return this.filePath;
  }

  /** Reads the latest configuration; a missing file returns an empty configuration. */
  async load(): Promise<Config> {
    const path = this.path();
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw error;
    }
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid config object");
    }
    const cfg = value as Config;
    if (cfg.mfgCmdPath !== undefined && typeof cfg.mfgCmdPath !== "string") {
      throw new Error("Invalid mfgCmdPath");
    }
    return cfg;
  }

  /** Flushes a temporary file and replaces configuration in the same directory. */
  async save(config: Config): Promise<void> {
    const path = this.path();
    const directory = dirname(path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const tmp = join(directory, `.config-${randomUUID()}.tmp`);
    try {
      const file = await open(tmp, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify(config, null, 2) + "\n");
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(tmp, path);
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }
}
