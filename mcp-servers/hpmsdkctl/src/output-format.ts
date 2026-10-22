import type { BuildOptions, OpenOCDInfo } from "./discovery/types.js";
import { Config } from "./config/config.js";
import type { ConfigData } from "./config/config-type.js";
import type * as zod from "zod/v4";
import type {
  buildOptionsOutputSchema,
  openOCDConfigOutputSchema,
  configSchema,
} from "./mcp/schemas.js";

/** Serializes an independent configuration snapshot to the public JSON contract. */
export function serializeConfig(data: ConfigData): zod.infer<typeof configSchema> {
  return new Config(data).toJSON();
}

/** Serializes internal build options to the public CLI and MCP field format. */
export function serializeBuildOptions(
  result: BuildOptions,
): Omit<zod.infer<typeof buildOptionsOutputSchema>, "ok" | "error"> {
  return {
    app_dir: result.appDir,
    boards:
      result.boards?.map((board) => ({
        name: board.name,
        build_types: board.buildTypes.map((buildType) => ({
          hpm_build_type: buildType.hpmBuildType,
          cmake_build_types: buildType.cmakeBuildTypes,
        })),
      })) ?? null,
  };
}

/** Serializes internal OpenOCD discovery to the public CLI and MCP field format. */
export function serializeOpenOCDConfig(
  result: OpenOCDInfo,
): Omit<zod.infer<typeof openOCDConfigOutputSchema>, "ok" | "error"> {
  return {
    board_name: result.boardName,
    probes: result.probes,
    socs: result.socs,
    boards: result.boards,
    default: result.default,
  };
}
