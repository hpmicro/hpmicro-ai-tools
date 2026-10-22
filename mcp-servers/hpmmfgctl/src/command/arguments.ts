import type { Target } from "./types.js";

/** Builds CMD arguments without shell quoting; ROM text remains a single argument. */
export function buildArgs(target: Target, timeoutMs: number, command: string): string[] {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 1800000) {
    throw new Error("timeoutMs must be between 1000 and 1800000");
  }
  if (target.transport === "serial" && !target.port) {
    throw new Error("Serial target has no port");
  }
  const connection =
    target.transport === "serial"
      ? ["-p", `${target.port},${target.baudRate ?? 115200}`]
      : [
          "-u",
          target.path ??
            `0x${(target.vid ?? 0).toString(16).padStart(4, "0")},0x${(target.pid ?? 0).toString(16).padStart(4, "0")}`,
        ];
  return [...connection, "-t", String(timeoutMs), "-r", command];
}
