import { spawn } from "node:child_process";
import iconv from "iconv-lite";
import type { Result } from "./types.js";

/** Retains bounded process output with the beginning and end of oversized logs. */
export class LogBuffer {
  private head = Buffer.alloc(0);
  private tail = Buffer.alloc(0);
  private total = 0;

  /** Sets the maximum retained output size in bytes. */
  constructor(private limit = 1 << 20) {}

  /** Appends a process output chunk while discarding excess middle bytes. */
  write(chunk: Buffer): void {
    this.total += chunk.length;
    const headLimit = Math.floor(this.limit / 2);
    const count = Math.min(chunk.length, headLimit - this.head.length);
    this.head = Buffer.concat([this.head, chunk.subarray(0, count)]);
    this.tail = Buffer.concat([this.tail, chunk.subarray(count)]).subarray(-headLimit);
  }

  /** Returns retained output with a truncation marker when needed. */
  bytes(): Buffer {
    if (this.total <= this.limit) {
      return Buffer.concat([this.head, this.tail]);
    }
    const marker = Buffer.from("\n[output truncated; middle omitted]\n");
    return Buffer.concat([this.head, marker, this.tail.subarray(marker.length)]);
  }
}
/** Serializes CMD processes and supports cancellation during queueing and execution. */
export class Runner {
  private queue: Promise<void> = Promise.resolve();

  /** Runs one command after earlier requests finish; rejects cancelled queued requests. */
  async run(path: string, args: string[], timeout: number, signal?: AbortSignal): Promise<Result> {
    signal?.throwIfAborted();
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(signal?.reason ?? new Error("Cancelled"));
        signal?.addEventListener("abort", abort, { once: true });
        previous.then(() => {
          signal?.removeEventListener("abort", abort);
          resolve();
        });
        if (signal?.aborted) {
          abort();
        }
      });
    } catch (error) {
      void previous.then(release);
      throw error;
    }
    try {
      signal?.throwIfAborted();
      return await this.execute(path, args, timeout, signal);
    } finally {
      release();
    }
  }

  /** Starts the process and collects its exit state, deadline, and decoded output. */
  private execute(
    path: string,
    args: string[],
    timeout: number,
    signal?: AbortSignal,
  ): Promise<Result> {
    const started = Date.now();
    return new Promise((resolve) => {
      const log = new LogBuffer();
      let timedOut = false;
      let startError: Error | undefined;
      const child = spawn(path, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (data: Buffer) => log.write(data));
      child.stderr.on("data", (data: Buffer) => log.write(data));
      child.on("error", (error) => {
        startError = error;
        log.write(Buffer.from(`failed to start command: ${error.message}`));
      });
      const abort = () => {
        child.kill();
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) {
        abort();
      }
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeout);
      child.on("close", (code) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        const bytes = log.bytes();
        const utf8 = new TextDecoder("utf-8", { fatal: true });
        let text: string;
        try {
          text = utf8.decode(bytes);
        } catch {
          text =
            process.platform === "win32" ? iconv.decode(bytes, "gb18030") : bytes.toString("utf8");
        }
        resolve({
          success: code === 0 && !timedOut && !signal?.aborted && !startError,
          exitCode: code ?? -1,
          timedOut,
          durationMs: Date.now() - started,
          log: text,
        });
      });
    });
  }
}
