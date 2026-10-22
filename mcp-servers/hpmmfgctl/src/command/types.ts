/** Connection settings retained by a process-local ROM target. */
export interface Target {
  /** CMD transport selected when the target is created. */
  transport: "serial" | "hid";
  /** Serial device path, such as COM11 or /dev/ttyUSB0. */
  port?: string;
  /** Serial speed; defaults to 115200 when omitted. */
  baudRate?: number;
  /** HID interface path passed directly to CMD. */
  path?: string;
  /** USB vendor ID; defaults to HPMicro VID 0x34B7. */
  vid?: number;
  /** USB product ID; zero matches any product during discovery. */
  pid?: number;
}

/** Process result shared by ROM operations and failed target probes. */
export interface Result {
  /** True only for exit code zero without timeout, cancellation, or start failure. */
  success: boolean;
  /** Process exit code, or -1 when no exit code is available. */
  exitCode: number;
  /** Whether the execution deadline terminated the process. */
  timedOut: boolean;
  /** Execution duration in milliseconds, excluding queue wait time. */
  durationMs: number;
  /** Combined stdout/stderr; capped at 1 MiB while preserving both ends. */
  log: string;
}

/** Installed CMD compatibility determined without accessing target hardware. */
export interface Validation {
  /** Whether executable checks and required CMD options passed. */
  compatible: boolean;
  /** Version text reported by the installed CMD. */
  version?: string;
  /** Reason the executable is unavailable or incompatible. */
  message?: string;
}
