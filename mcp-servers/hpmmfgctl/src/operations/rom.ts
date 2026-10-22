import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import { romSchemas } from "../mcp/schemas.js";
import type { ROMCommand, ROMName } from "../mcp/mcp-type.js";

/** Selects default CMD deadlines for query, transfer, and erase operations. */
export function defaultTimeout(name: ROMName): number {
  if (name === "erase_chip") {
    return 1800000;
  }
  return /erase|write|read_memory_to_file|load/.test(name) ? 600000 : 30000;
}
/** Validates a ROM request and file preconditions before constructing CMD text. */
export async function buildROM(name: ROMName, raw: unknown): Promise<ROMCommand> {
  const input = romSchemas[name].parse(raw);
  const value = input as unknown as Record<string, string | number | boolean | undefined>;
  const hex = (field: string) => `0x${Number(value[field]).toString(16)}`;
  if ("filePath" in input) {
    if (name === "read_memory_to_file") {
      try {
        await stat(input.filePath);
        if (!value.overwrite) {
          throw new Error("Output file already exists; set overwrite=true");
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
      if (!(await stat(dirname(input.filePath))).isDirectory()) {
        throw new Error("Output parent must be a directory");
      }
    } else if (!(await stat(input.filePath)).isFile()) {
      throw new Error("Input must be a regular file");
    }
  }
  let command: string;
  switch (name) {
    case "query_rte":
      if ((value.rteId === 4) !== (value.argument !== undefined)) {
        throw new Error("argument is required only when rteId=4");
      }
      command = `query-rte ${value.rteId}${value.argument === undefined ? "" : ` ${hex("argument")}`}`;
      break;
    case "config_rte":
      command = `config-rte ${hex("peripheralMask")} ${value.baudRate}`;
      break;
    case "config_memory":
      command = `config-memory ${hex("memoryId")} ${hex("address")}`;
      break;
    case "read_memory":
    case "read_memory_to_file":
      command = `read-memory ${hex("memoryId")} ${hex("address")} ${value.length}${value.filePath ? ` ${value.filePath}` : ""}`;
      break;
    case "write_memory":
    case "write_memory_from_file":
    case "verify_checksum":
    case "verify_checksum_from_file": {
      const payload = value.filePath ?? `[[${String(value.data).replace(/^\[\[|\]\]$/g, "")}]]`;
      command = `${name.startsWith("write") ? "write-memory" : "verify-checksum"} ${hex("memoryId")} ${hex("address")} ${payload}`;
      break;
    }
    case "erase_region":
      command = `erase-region ${hex("memoryId")} ${hex("address")} ${value.length}`;
      break;
    case "erase_chip":
      command = `erase-chip ${hex("memoryId")}`;
      break;
    case "load_image":
      command = `load-image ${value.filePath}`;
      break;
    case "load_bootloader_firmware":
      command = `load-blfw ${value.series} ${value.signed ? 1 : 0}`;
      break;
    case "reset":
      command = `reset ${value.resetType}`;
      break;
  }
  return { input, command };
}
