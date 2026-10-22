import type { McpServer } from "@modelcontextprotocol/server";
import type { Service } from "../hpm-mfg-service.js";
import { cmdSetSchema, emptyInputSchema } from "./schemas.js";
import { registerTool } from "./registration.js";

/** Registers configuration tools without accessing files or starting CMD processes. */
export function registerConfigurationTools(server: McpServer, service: Service): void {
  registerTool(
    server,
    "mfg.doctor",
    {
      description: "Refresh manufacturing command compatibility and report configuration",
      inputSchema: emptyInputSchema,
      readOnly: true,
      destructive: false,
    },
    (_input, signal) => service.doctor(signal),
  );

  registerTool(
    server,
    "mfg.get",
    {
      description: "Get configured CMD path",
      inputSchema: emptyInputSchema,
      readOnly: true,
      destructive: false,
    },
    async () => ({ ...(await service.store.load()) }),
  );

  registerTool(
    server,
    "mfg.set",
    {
      description: "Validate and save the installed CMD absolute path",
      inputSchema: cmdSetSchema,
      readOnly: false,
      destructive: false,
    },
    async (input, signal) => ({ ...(await service.set(input.path, signal)) }),
  );

  registerTool(
    server,
    "mfg.clear",
    {
      description: "Clear configured CMD path",
      inputSchema: emptyInputSchema,
      readOnly: false,
      destructive: false,
    },
    () => service.clear(),
  );
}
