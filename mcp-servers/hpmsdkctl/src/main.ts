#!/usr/bin/env node
import { CommanderError } from "commander";
import { pathToFileURL } from "node:url";
import { createService } from "./hpm-sdk-service.js";
import { createCli } from "./cli/cli.js";

/** Parses and dispatches CLI arguments; help succeeds and other errors propagate. */
export async function main(toolArguments: string[]): Promise<void> {
  const program = createCli(createService());
  if (toolArguments.length === 0) {
    program.outputHelp();
    return;
  }
  try {
    await program.parseAsync(toolArguments, { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) {
      return;
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message.startsWith("error:") ? message : `error: ${message}`);
    process.exitCode = 1;
  });
}
