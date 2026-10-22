#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./mcp/server.js";

/** CLI arguments select the stdio transport; stdout remains reserved for MCP. */
const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  console.error("Usage: hpmmfgctl mcp | hpmmfgctl serve --stdio");
} else if (
  (args.length === 1 && args[0] === "mcp") ||
  (args.length === 2 && args[0] === "serve" && args[1] === "--stdio")
) {
  const server = createServer();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void server.close();
    });
  }
  await server.connect(new StdioServerTransport());
} else {
  console.error("Usage: hpmmfgctl mcp | hpmmfgctl serve --stdio");
  process.exitCode = 1;
}
