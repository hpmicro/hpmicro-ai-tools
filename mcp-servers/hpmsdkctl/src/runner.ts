import { spawn } from "node:child_process";
import type { Writable } from "node:stream";

/** Execution context for external tools; arguments are not interpreted by a shell. */
export interface RunOptions {
  /** Child working directory; defaults to the current directory. */
  cwd?: string;
  /** Complete child environment; inherited when omitted, never merged automatically. */
  env?: NodeJS.ProcessEnv;
  /** Optional live stdout sink; output is also captured in full. */
  stdout?: Writable;
  /** Optional live stderr sink; stderr is kept separate from stdout. */
  stderr?: Writable;
  /** Aborts execution and terminates the child, rejecting the promise. */
  signal?: AbortSignal;
}

/** Raw tool result; a nonzero exit code does not cause the runner to reject. */
export interface RunResult {
  /** Executable and separate arguments, retained for logging and parity checks. */
  command: string[];
  /** Present only when the caller specifies cwd. */
  workDir?: string;
  /** Exit code, or -1 when unavailable (for example, after signal termination). */
  exitCode: number;
  /** Complete standard output decoded as UTF-8. */
  stdout: string;
  /** Complete standard error decoded as UTF-8. */
  stderr: string;
}

/** Injectable execution boundary for recording commands and simulating results in tests. */
export type Runner = (
  executablePath: string,
  toolArguments: string[],
  executionOptions?: RunOptions,
) => Promise<RunResult>;

/**
 * Starts a tool directly, waits for exit, and captures or forwards its output.
 * @param executablePath Executable path, not a shell command string.
 * @param toolArguments Separate arguments that require no shell escaping.
 * @param executionOptions Working directory, environment, output sinks, and cancellation signal.
 * @returns Raw result, including nonzero exits; rejects on startup failure or abort.
 */
export const run: Runner = (executablePath, toolArguments, executionOptions = {}) =>
  new Promise((resolve, reject) => {
    const childProcess = spawn(executablePath, toolArguments, {
      cwd: executionOptions.cwd,
      env: executionOptions.env,
      signal: executionOptions.signal,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    childProcess.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      executionOptions.stdout?.write(chunk);
    });
    childProcess.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      executionOptions.stderr?.write(chunk);
    });
    childProcess.once("error", reject);
    childProcess.once("close", (exitCode) =>
      resolve({
        command: [executablePath, ...toolArguments],
        ...(executionOptions.cwd ? { workDir: executionOptions.cwd } : {}),
        exitCode: exitCode ?? -1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
      }),
    );
  });
