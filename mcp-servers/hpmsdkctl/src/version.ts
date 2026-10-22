import { readFileSync } from "node:fs";

const packageMetadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

/** Package release version shared by the CLI and MCP server. */
export const version: string = packageMetadata.version;
