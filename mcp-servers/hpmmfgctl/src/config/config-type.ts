/** Serialized configuration compatible with the Go manufacturing server. */
export interface Config {
  /** Absolute installed CMD executable path; omitted when not configured. */
  mfgCmdPath?: string;
}
