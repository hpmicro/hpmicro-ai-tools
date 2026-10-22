import type { CallToolResult } from "@modelcontextprotocol/server";

/** Formats structured tool data, process logs, and consistent MCP error status. */
export function structuredResponse(responseData: Record<string, unknown>): CallToolResult {
  const validation = responseData.validation as { compatible: boolean } | undefined;
  const text =
    typeof responseData.log === "string" ? responseData.log : JSON.stringify(responseData, null, 2);

  return {
    structuredContent: responseData,
    content: [{ type: "text", text }],
    isError: responseData.success === false || validation?.compatible === false,
  };
}

/** Converts precondition failures and exceptions to readable, structured MCP errors. */
export function errorResponse(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);

  return {
    structuredContent: { error: message },
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
