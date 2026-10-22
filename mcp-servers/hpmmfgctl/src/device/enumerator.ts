import { access } from "node:fs/promises";
import { constants } from "node:fs";
import type { DeviceInfo, Enumerator } from "./types.js";

/** HPMicro USB vendor ID used when the caller omits a HID vendor filter. */
export const defaultVID = 0x34b7;

/** Discovers devices using native OS bindings on supported manufacturing platforms. */
export class SystemEnumerator implements Enumerator {
  /** Rejects platforms outside the Manufacturing CMD support matrix. */
  private supported(): void {
    if (!["win32", "linux"].includes(process.platform) || process.arch !== "x64") {
      throw new Error("Supported platforms: Windows x64 and Linux x86_64");
    }
  }

  /** Lists serial ports; Windows accessibility is verified later by the CMD probe. */
  async listSerial(): Promise<DeviceInfo[]> {
    this.supported();
    const { autoDetect } = await import("@serialport/bindings-cpp");
    const ports = await autoDetect().list();
    return Promise.all(
      ports.map(async (port) => {
        const accessible =
          process.platform === "win32" ||
          (await access(port.path, constants.R_OK | constants.W_OK).then(
            () => true,
            () => false,
          ));
        return {
          path: port.path,
          description: port.manufacturer ?? "",
          accessible,
          ...(accessible ? {} : { hint: "Check device permissions and group membership" }),
        };
      }),
    );
  }

  /** Lists matching HID interfaces and checks whether each can be opened. */
  async listHID(vid: number, pid: number): Promise<DeviceInfo[]> {
    this.supported();
    const hid = await import("node-hid");
    // Linux CMD expects hidraw paths rather than libusb bus identifiers.
    if (process.platform === "linux") {
      hid.setDriverType("hidraw");
    }
    const devices = (await hid.devicesAsync()).filter(
      (device) =>
        device.path && (!vid || device.vendorId === vid) && (!pid || device.productId === pid),
    );
    const result: DeviceInfo[] = [];
    for (const device of devices) {
      let accessible = false;
      try {
        const handle = await hid.HIDAsync.open(device.path!);
        await handle.close();
        accessible = true;
      } catch {
        /* Permission or exclusive-access failure. */
      }
      result.push({
        path: device.path!,
        vid: device.vendorId,
        pid: device.productId,
        description: device.product ?? "",
        accessible,
        ...(accessible
          ? {}
          : {
              hint: "Check HID permissions or another application's exclusive access",
            }),
      });
    }
    return result.sort((left, right) => left.path.localeCompare(right.path));
  }
}
