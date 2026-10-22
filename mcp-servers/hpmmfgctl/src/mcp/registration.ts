import type { McpServer, ToolCallback } from "@modelcontextprotocol/server";
import type { z as zod } from "zod";
import { errorResponse, structuredResponse } from "./responses.js";

/** Tool metadata kept separate from its business operation. */
export interface ToolDefinition<Schema extends zod.ZodObject> {
  /** Human-readable tool behavior shown to the agent. */
  description: string;
  /** Runtime validation and JSON schema source for tool inputs. */
  inputSchema: Schema;
  /** Whether the operation leaves hardware and local files unchanged. */
  readOnly: boolean;
  /** Whether the operation can alter hardware state or overwrite local data. */
  destructive: boolean;
}

/** Registers a typed operation with shared input validation and response formatting. */
export function registerTool<Schema extends zod.ZodObject>(
  server: McpServer,
  name: string,
  definition: ToolDefinition<Schema>,
  handler: (
    input: zod.infer<Schema>,
    signal?: AbortSignal,
  ) => Promise<Record<string, unknown>> | Record<string, unknown>,
): void {
  const callback: ToolCallback<zod.ZodObject> = async (input, context) => {
    try {
      const validatedInput = definition.inputSchema.parse(input) as zod.infer<Schema>;
      return structuredResponse(await handler(validatedInput, context.mcpReq.signal));
    } catch (error) {
      return errorResponse(error);
    }
  };

  server.registerTool(
    name,
    {
      description: definition.description,
      inputSchema: definition.inputSchema as zod.ZodObject,
      annotations: {
        readOnlyHint: definition.readOnly,
        destructiveHint: definition.destructive,
        openWorldHint: false,
      },
    },
    callback,
  );
}
