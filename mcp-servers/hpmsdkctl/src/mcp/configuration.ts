import type { McpServer } from "@modelcontextprotocol/server";
import type { McpHandlers } from "./mcp-handlers.js";
import {
  configGetSchema,
  configGetOutputSchema,
  configSetSchema,
  configUnsetSchema,
  savedSchema,
  initSchema,
  emptyInputSchema,
  configListOutputSchema,
  configDoctorOutputSchema,
} from "./schemas.js";

/** Registers configuration tools without invoking their actions. */
export function registerConfigurationTools(server: McpServer, handlers: McpHandlers): void {
  server.registerTool(
    "config.get",
    {
      description: "Read one hpmsdkctl config value by key.",
      inputSchema: configGetSchema,
      outputSchema: configGetOutputSchema,
    },
    (input) => handlers.getConfigValue(input),
  );

  server.registerTool(
    "config.set",
    {
      description: "Set one hpmsdkctl config value and persist config.json.",
      inputSchema: configSetSchema,
      outputSchema: savedSchema,
    },
    (input) => handlers.setConfigValue(input),
  );

  server.registerTool(
    "config.unset",
    {
      description: "Clear one hpmsdkctl config value by key or alias and persist config.json.",
      inputSchema: configUnsetSchema,
      outputSchema: savedSchema,
    },
    (input) => handlers.unsetConfigValue(input),
  );

  server.registerTool(
    "config.init",
    {
      description:
        "Initialize hpmsdkctl config. Use sdk_env or explicit tool paths (mutually exclusive).",
      inputSchema: initSchema,
      outputSchema: savedSchema,
    },
    (input) => handlers.initialize(input),
  );

  server.registerTool(
    "config.list",
    {
      description: "Read the full hpmsdkctl config.",
      inputSchema: emptyInputSchema,
      outputSchema: configListOutputSchema,
    },
    () => handlers.listConfig(),
  );

  server.registerTool(
    "config.check",
    {
      description: "Check hpmsdkctl config paths and required HPM SDK environment.",
      inputSchema: emptyInputSchema,
      outputSchema: configDoctorOutputSchema,
    },
    () => handlers.doctor(),
  );
}
