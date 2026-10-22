import { copyFileSync } from "node:fs";
copyFileSync(
  new URL("../src/mcp/instructions.md", import.meta.url),
  new URL("../dist/mcp/instructions.md", import.meta.url),
);
