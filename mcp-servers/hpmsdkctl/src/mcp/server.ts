import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { readFileSync } from "node:fs";
import { createService, type HpmSdkService } from "../hpm-sdk-service.js";
import { McpHandlers } from "./mcp-handlers.js";
import { registerConfigurationTools } from "./configuration.js";
import { registerDiscoveryTools } from "./discovery.js";
import { registerOperationTools } from "./operations.js";
import { version } from "../version.js";

/**
 * Creates the MCP server and registers its tools without starting external processes.
 * @param service Shared business operations composed at the application entry point.
 * @returns Server ready to connect to a transport.
 */
export function createServer(service: HpmSdkService = createService()): McpServer {
  const server = new McpServer(
    { name: "hpmsdkctl", title: "HPM SDK CLI MCP Server", version },
    { instructions: readFileSync(new URL("./instructions.md", import.meta.url), "utf8") },
  );
  const handlers = new McpHandlers(service);
  registerConfigurationTools(server, handlers);
  registerDiscoveryTools(server, handlers);
  registerOperationTools(server, handlers);
  return server;
}

/** Connects stdio; stdout is reserved for MCP and must not contain ordinary logs. */
export async function startServer(service: HpmSdkService = createService()): Promise<void> {
  await createServer(service).connect(new StdioServerTransport());
}
