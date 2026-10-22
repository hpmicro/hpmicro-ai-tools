import type { McpServer } from "@modelcontextprotocol/server";
import type { Service } from "../hpm-mfg-service.js";
import {
  deviceDiscoverSchema,
  emptyInputSchema,
  targetCreateSchema,
  targetDeleteSchema,
} from "./schemas.js";
import { registerTool } from "./registration.js";

/** Registers OS discovery and process-local target management tools. */
export function registerDiscoveryTools(server: McpServer, service: Service): void {
  registerTool(
    server,
    "device.discover",
    {
      description: "Discover serial or HID devices using OS interfaces",
      inputSchema: deviceDiscoverSchema,
      readOnly: true,
      destructive: false,
    },
    (input) => service.discover(input.transport, input.vid, input.pid),
  );

  registerTool(
    server,
    "device.create",
    {
      description: "Probe with query-rte 0 and register an in-process ROM target",
      inputSchema: targetCreateSchema,
      readOnly: false,
      destructive: false,
    },
    (input, signal) => service.create(input, signal),
  );

  registerTool(
    server,
    "device.list",
    {
      description: "List registered targets",
      inputSchema: emptyInputSchema,
      readOnly: true,
      destructive: false,
    },
    () => service.list(),
  );

  registerTool(
    server,
    "device.delete",
    {
      description: "Delete registered target",
      inputSchema: targetDeleteSchema,
      readOnly: false,
      destructive: false,
    },
    (input) => service.delete(input.targetId),
  );
}
