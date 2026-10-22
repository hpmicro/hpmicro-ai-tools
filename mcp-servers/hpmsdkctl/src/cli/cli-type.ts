import type { GenerateInput } from "../operations/types.js";
import type { InitInput } from "../config/config-type.js";

/** Application source options shared by generation and build discovery. */
export interface ApplicationOptions {
  sample?: string;
  appDir?: string;
}

/** CLI generation options, adapted explicitly to the operation model. */
export interface GenerateOptions extends Partial<Omit<GenerateInput, "customGccLinkerFile">> {
  customGccLinker?: string;
}

/** Manual tool paths or SDK Env initialization options. */
export type InitializeOptions = InitInput;

/** Build-directory options shared by compilation and localization. */
export interface BuildDirectoryOptions {
  buildDir?: string;
}

/** Application directory to restore after localization. */
export interface UnlocalizeOptions {
  localizedDir?: string;
}

/** Board and optional application source used for OpenOCD discovery. */
export interface OpenOCDConfigOptions {
  board?: string;
  app?: string;
}

/** OpenOCD configuration selections shared by hardware commands. */
export interface OpenOCDOptions {
  probe?: string;
  soc?: string;
  board?: string;
}

/** Firmware and explicit load address used by flash; BIN firmware requires the address. */
export interface FlashOptions extends OpenOCDOptions {
  file?: string;
  address?: string;
}

/** OpenOCD settings used by the debug-server command. */
export type GDBServerOptions = OpenOCDOptions;
