import type { McpServer } from "@modelcontextprotocol/server";
import type { Service } from "../hpm-mfg-service.js";
import type { ROMName } from "./mcp-type.js";
import { romSchemas } from "./schemas.js";
import { registerTool } from "./registration.js";

/** Registers ROM tools with the same constraints used by command construction. */
export function registerOperationTools(server: McpServer, service: Service): void {
  for (const name of Object.keys(romSchemas) as ROMName[]) {
    const readOnly = /^(query|read|verify)/.test(name) && name !== "read_memory_to_file";
    const destructive = !/^(query|read|verify)/.test(name) || name === "read_memory_to_file";
    const fileWarning =
      name === "read_memory_to_file" ? "; writes a local file and may overwrite it" : "";

    registerTool(
      server,
      `rom.${name}`,
      {
        description: `${name.replaceAll("_", " ")} through the installed Manufacturing CMD${fileWarning}`,
        inputSchema: romSchemas[name],
        readOnly,
        destructive,
      },
      (input, signal) => service.rom(name, input, signal),
    );
  }
}
