import { createBridgeDriver } from "./bridge-driver";
import { createEpsonEposDriver } from "./epson-epos-driver";
import type { ConnectionType, PrinterDriver } from "./printer-driver";
import { systemPrinter } from "./system-printer";
import { createWebBluetoothDriver, type BluetoothLike } from "./web-bluetooth-driver";
import { createWebSerialDriver, type SerialLike } from "./web-serial-driver";
import { createWebUsbDriver, type UsbLike } from "./web-usb-driver";

let drivers: Record<Exclude<ConnectionType, "system">, PrinterDriver> | undefined;

/** A browser API by name, if this browser (and page context) has it. */
function navigatorApi<T>(name: "serial" | "bluetooth" | "usb"): T | undefined {
  return typeof navigator !== "undefined" && name in navigator ? (navigator[name as keyof Navigator] as T) : undefined;
}

/** One driver per page load, so an open port/device is reused across prints instead of reopened. */
export function browserPrinterDrivers() {
  drivers ??= {
    "web-serial": createWebSerialDriver(navigatorApi<SerialLike>("serial")),
    "web-bluetooth": createWebBluetoothDriver(navigatorApi<BluetoothLike>("bluetooth")),
    "web-usb": createWebUsbDriver(navigatorApi<UsbLike>("usb")),
    "epson-epos": createEpsonEposDriver(),
    bridge: createBridgeDriver(),
  };
  return { system: systemPrinter, drivers };
}
