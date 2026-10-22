import type { McpServer } from "@modelcontextprotocol/server";
import type { McpHandlers } from "./mcp-handlers.js";
import {
  buildOptionsSchema,
  buildOptionsOutputSchema,
  openOCDConfigSchema,
  openOCDConfigOutputSchema,
} from "./schemas.js";

/** Registers discovery tools without invoking their actions. */
export function registerDiscoveryTools(server: McpServer, handlers: McpHandlers): void {
  server.registerTool(
    "build.list_options",
    {
      description: "Query compatible boards and HPM/CMake build-type combinations.",
      inputSchema: buildOptionsSchema,
      outputSchema: buildOptionsOutputSchema,
    },
    (input) => handlers.getBuildOptions(input),
  );

  server.registerTool(
    "openocd.list_configs",
    {
      description: "Discover OpenOCD probe, SoC and board configurations with defaults.",
      inputSchema: openOCDConfigSchema,
      outputSchema: openOCDConfigOutputSchema,
    },
    (input) => handlers.getOpenOCDConfig(input),
  );
}
