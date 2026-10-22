/** Operating-system device information returned by discovery. */
export interface DeviceInfo {
  /** Serial device or HID interface path used to create a target. */
  path: string;
  /** USB vendor ID, when available. */
  vid?: number;
  /** USB product ID, when available. */
  pid?: number;
  /** Human-readable device description reported by the operating system. */
  description: string;
  /** Discovery accessibility hint; actual CMD access is verified during target creation. */
  accessible: boolean;
  /** Permission or exclusive-access guidance for unavailable devices. */
  hint?: string;
}

/** Device discovery boundary, replaceable for service tests. */
export interface Enumerator {
  /** Lists serial devices without performing ROM communication. */
  listSerial(): Promise<DeviceInfo[]>;
  /** Lists HID devices filtered by vendor and product; zero disables that filter. */
  listHID(vid: number, pid: number): Promise<DeviceInfo[]>;
}
