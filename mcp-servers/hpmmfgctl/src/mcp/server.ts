import { McpServer } from "@modelcontextprotocol/server";
import { Service } from "../hpm-mfg-service.js";
import { registerConfigurationTools } from "./configuration.js";
import { registerDiscoveryTools } from "./discovery.js";
import { registerOperationTools } from "./operations.js";

/** Creates and registers MCP tools without starting external processes. */
export function createServer(service: Service = new Service()): McpServer {
  const server = new McpServer(
    { name: "hpmmfgctl", title: "HPM Manufacturing", version: "0.1.0" },
    {
      instructions:
        "Run mfg.doctor first. Create a target before ROM operations. Confirm target, address, length and file before destructive operations unless already authorized. ROM file paths cannot contain whitespace.",
    },
  );

  registerConfigurationTools(server, service);
  registerDiscoveryTools(server, service);
  registerOperationTools(server, service);
  return server;
}
