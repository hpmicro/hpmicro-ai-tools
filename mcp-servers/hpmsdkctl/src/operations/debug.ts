import * as path from "node:path";
import { exists, type Config } from "../config/config.js";
import { run, type Runner, type RunOptions } from "../runner.js";
import { assertRequiredInput, createOutput } from "./support.js";
import type { FlashInput, GDBInput, Output } from "./types.js";
/** Builds ordered OpenOCD arguments; validates SDK names and passes explicit cfg paths through. */
export function openOCDArgs(configuration: Config, input: GDBInput): string[] {
  for (const inputKey of ["probe", "soc", "board"] as const) {
    assertRequiredInput(input[inputKey], inputKey);
  }
  const openocdDirectory = path.join(configuration.hpmSdk, "boards", "openocd");
  const resolveConfigPath = (category: string, name: string) => {
    if (name.includes(path.sep) || name.endsWith(".cfg")) {
      return name;
    }
    const configPath = path.join(openocdDirectory, category, name + ".cfg");
    if (!exists(configPath)) {
      throw new Error(`${category} config ${JSON.stringify(name)} not found at ${configPath}`);
    }
    return configPath;
  };
  return [
    "-s",
    openocdDirectory,
    "-f",
    resolveConfigPath("probes", input.probe),
    "-f",
    resolveConfigPath("soc", input.soc),
    "-f",
    resolveConfigPath("boards", input.board),
  ];
}
/** Quotes string data and escapes control characters for Tcl commands, not shell arguments. */
export function quoteCommandString(value: string): string {
  const escapes: Record<string, string> = {
    "\x07": "\\a",
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
    "\v": "\\v",
    "\\": "\\\\",
    '"': '\\"',
    "[": "\\[",
    "]": "\\]",
    $: "\\$",
  };
  let quotedValue = '"';
  for (const character of value) {
    if (escapes[character]) {
      quotedValue += escapes[character];
    } else if (/[\p{L}\p{M}\p{N}\p{P}\p{S} ]/u.test(character)) {
      quotedValue += character;
    } else {
      const codePoint = character.codePointAt(0)!;
      if (codePoint < 256) {
        quotedValue += "\\x" + codePoint.toString(16).padStart(2, "0");
      } else if (codePoint <= 65535) {
        quotedValue += "\\u" + codePoint.toString(16).padStart(4, "0");
      } else {
        quotedValue += "\\U" + codePoint.toString(16).padStart(8, "0");
      }
    }
  }
  return quotedValue + '"';
}
/** Builds program/verify/reset/exit commands; BIN firmware requires an explicit address. */
export function programCommand(file: string, address = ""): string {
  if (path.extname(file).toLowerCase() === ".bin" && !address) {
    throw new Error("address is required for BIN firmware");
  }
  if (address && !/^(?:0[xX][0-9a-fA-F]+|[0-9]+)$/.test(address)) {
    throw new Error("address must be a decimal or hexadecimal integer");
  }
  const normalizedFilePath = file.split(path.sep).join("/");
  return `program ${quoteCommandString(normalizedFilePath)} verify${address ? " " + address : ""}; reset_soc; exit`;
}
/** Writes and verifies real hardware through OpenOCD, resets, and exits; nonzero exits remain in the result. */
export async function flash(
  configuration: Config,
  input: FlashInput,
  executionOptions: RunOptions = {},
  runner: Runner = run,
): Promise<Output> {
  for (const inputKey of ["probe", "soc", "board", "file"] as const) {
    assertRequiredInput(input[inputKey], inputKey);
  }
  configuration.normalize();
  assertRequiredInput(configuration.tools.openocd, "openocd");
  return createOutput(
    await runner(
      configuration.tools.openocd || "",
      [...openOCDArgs(configuration, input), "-c", programCommand(input.file, input.address)],
      { ...executionOptions, env: configuration.environment() },
    ),
  );
}
/** Starts OpenOCD's GDB server and waits for exit; no built-in timeout, cancellation via opts.signal. */
export async function gdbserver(
  configuration: Config,
  input: GDBInput,
  executionOptions: RunOptions = {},
  runner: Runner = run,
): Promise<Output> {
  configuration.normalize();
  assertRequiredInput(configuration.tools.openocd, "openocd");
  return createOutput(
    await runner(configuration.tools.openocd || "", openOCDArgs(configuration, input), {
      ...executionOptions,
      env: configuration.environment(),
    }),
  );
}
