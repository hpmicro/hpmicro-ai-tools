import { normalize } from "node:path";
import { stat } from "node:fs/promises";
import { Store } from "./config/config-store.js";
import { Runner } from "./command/runner.js";
import { buildArgs } from "./command/arguments.js";
import { validatePath } from "./command/validate.js";
import type { Result, Target, Validation } from "./command/types.js";
import { SystemEnumerator, defaultVID } from "./device/enumerator.js";
import type { Enumerator } from "./device/types.js";
import { buildROM, defaultTimeout } from "./operations/rom.js";
import type { ROMName } from "./mcp/mcp-type.js";
import type { CachedValidation, TargetCreateInput } from "./service-type.js";

/** Coordinates configuration, device probing, and serialized ROM operations. */
export class Service {
  private targets = new Map<string, Target>();
  private next = 0;
  private cached?: CachedValidation;

  /** Injects storage, process execution, and discovery without accessing hardware. */
  constructor(
    readonly store = new Store(),
    readonly runner = new Runner(),
    readonly devices: Enumerator = new SystemEnumerator(),
  ) {}

  /** Caches successful compatibility checks by file identity; forced checks invalidate stale success. */
  async validate(path: string, signal?: AbortSignal, force = false): Promise<Validation> {
    let key = "";
    try {
      const info = await stat(path);
      key = `${normalize(path)}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    } catch {
      /* Invalid paths are not cached. */
    }
    if (!force && key && this.cached?.key === key) {
      return this.cached.validation;
    }
    const validation = await validatePath(path, this.runner, signal);
    if (validation.compatible && key) {
      this.cached = { key, validation };
    } else if (this.cached?.key === key) {
      this.cached = undefined;
    }
    return validation;
  }

  /** Refreshes compatibility and reports the active plugin configuration. */
  async doctor(signal?: AbortSignal): Promise<Record<string, unknown>> {
    const config = await this.store.load();
    const validation = await this.validate(config.mfgCmdPath ?? "", signal, true);
    return {
      mcpVersion: "0.1.0",
      os: process.platform,
      arch: process.arch,
      configPath: this.store.path(),
      configuredPath: config.mfgCmdPath ?? "",
      validation,
      pathWhitespaceUnsupported: true,
    };
  }

  /** Persists an absolute CMD path only after a successful compatibility check. */
  async set(path: string, signal?: AbortSignal): Promise<Validation> {
    const validation = await this.validate(path, signal, true);
    if (!validation.compatible) {
      throw new Error(validation.message);
    }
    await this.store.save({ mfgCmdPath: normalize(path) });
    return validation;
  }

  /** Clears persisted CMD settings and cached compatibility. */
  async clear(): Promise<Record<string, unknown>> {
    await this.store.save({});
    this.cached = undefined;
    return { cleared: true };
  }

  /** Discovers devices without registering targets or issuing ROM commands. */
  async discover(
    transport: "serial" | "hid",
    vid = defaultVID,
    pid = 0,
  ): Promise<Record<string, unknown>> {
    return {
      transport,
      devices:
        transport === "serial"
          ? await this.devices.listSerial()
          : await this.devices.listHID(vid || defaultVID, pid),
    };
  }

  /** Probes query-rte 0 and registers the target only when CMD reports success. */
  async create(input: TargetCreateInput, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const target = { ...input };
    delete (target as { timeoutMs?: number }).timeoutMs;
    if (target.transport === "serial") {
      target.baudRate ||= 115200;
      if (!target.port) {
        const list = await this.devices.listSerial();
        if (list.length !== 1) {
          throw new Error(`Exactly one serial device required; found ${list.length}`);
        }
        target.port = list[0].path;
      }
    } else {
      target.vid ||= defaultVID;
      if (!target.path) {
        const list = await this.devices.listHID(target.vid, target.pid ?? 0);
        if (list.length !== 1) {
          throw new Error(`Exactly one HID device required; found ${list.length}`);
        }
        if (!list[0].accessible) {
          throw new Error("HID device is not accessible");
        }
        target.path = list[0].path;
      }
    }
    const probe = await this.run(target, input.timeoutMs ?? 10000, "query-rte 0", signal);
    if (!probe.success) {
      return { ...probe };
    }
    const targetId = `target-${++this.next}`;
    this.targets.set(targetId, target);
    return { target: { targetId, ...target }, probe };
  }

  /** Returns connection settings for targets registered in this process. */
  list(): Record<string, unknown> {
    return {
      targets: [...this.targets].map(([targetId, target]) => ({
        targetId,
        ...target,
      })),
    };
  }

  /** Deletes a registered target and rejects unknown IDs. */
  delete(targetId: string): Record<string, unknown> {
    if (!this.targets.delete(targetId)) {
      throw new Error("unknown targetId");
    }
    return { targetId, deleted: true };
  }

  /** Validates a ROM request and executes it against a registered target. */
  async rom(name: ROMName, raw: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const { input, command } = await buildROM(name, raw);
    const target = this.targets.get(input.targetId);
    if (!target) {
      throw new Error("unknown targetId");
    }
    return {
      ...(await this.run(target, input.timeoutMs ?? defaultTimeout(name), command, signal)),
    };
  }

  /** Resolves a compatible CMD and executes the transport-specific ROM arguments. */
  private async run(
    target: Target,
    timeout: number,
    command: string,
    signal?: AbortSignal,
  ): Promise<Result> {
    const { mfgCmdPath = "" } = await this.store.load();
    const validation = await this.validate(mfgCmdPath, signal);
    if (!validation.compatible) {
      throw new Error(`Manufacturing command is not ready: ${validation.message}`);
    }
    return this.runner.run(mfgCmdPath, buildArgs(target, timeout, command), timeout + 5000, signal);
  }
}
