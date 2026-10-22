import type { McpServer } from "@modelcontextprotocol/server";
import type { McpHandlers } from "./mcp-handlers.js";
import {
  generateSchema,
  buildDirectorySchema,
  flashSchema,
  gdbSchema,
  unlocalizeSchema,
  unlocalizeOutputSchema,
  processOutputSchema,
} from "./schemas.js";

/** Registers operations tools without invoking their actions. */
export function registerOperationTools(server: McpServer, handlers: McpHandlers): void {
  server.registerTool(
    "build.generate",
    {
      description:
        "Run CMake generate for an HPM SDK sample or app directory with exactly one of board or custom_board.",
      inputSchema: generateSchema,
      outputSchema: processOutputSchema,
    },
    (input, requestContext) => handlers.generate(input, requestContext.mcpReq.signal),
  );

  server.registerTool(
    "build.compile",
    {
      description: "Run Ninja in a generated HPM SDK build directory.",
      inputSchema: buildDirectorySchema,
      outputSchema: processOutputSchema,
    },
    (input, requestContext) => handlers.compile(input, requestContext.mcpReq.signal),
  );

  server.registerTool(
    "openocd.flash",
    {
      description:
        "Flash a firmware file to target hardware via OpenOCD; BIN files require address.",
      inputSchema: flashSchema,
      outputSchema: processOutputSchema,
    },
    (input, requestContext) => handlers.flash(input, requestContext.mcpReq.signal),
  );

  server.registerTool(
    "openocd.start_gdb_server",
    {
      description: "Start a GDB server for the target board via OpenOCD.",
      inputSchema: gdbSchema,
      outputSchema: processOutputSchema,
    },
    (input, requestContext) => handlers.gdbserver(input, requestContext.mcpReq.signal),
  );

  server.registerTool(
    "project.localize_sdk",
    {
      description: "Run localize_sdk to copy SDK sources into the project.",
      inputSchema: buildDirectorySchema,
      outputSchema: processOutputSchema,
    },
    (input, requestContext) => handlers.localize(input, requestContext.mcpReq.signal),
  );

  server.registerTool(
    "project.unlocalize_sdk",
    {
      description: "Restore original CMakeLists.txt from localization backup.",
      inputSchema: unlocalizeSchema,
      outputSchema: unlocalizeOutputSchema,
    },
    (input) => handlers.unlocalize(input),
  );
}
