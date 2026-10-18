import type { PairedDevice, PrinterDriver } from "./printer-driver";

/** The slice of the Web Serial API this driver uses (lib.dom has no Web Serial types yet). */
export interface SerialPortLike {
  getInfo(): PairedDevice;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readonly writable: { getWriter(): { write(chunk: Uint8Array): Promise<void>; releaseLock(): void } } | null;
}

export interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>;
  requestPort(options?: { allowedBluetoothServiceClassIds?: string[] }): Promise<SerialPortLike>;
}

/** Bluetooth Classic Serial Port Profile — what cheap 58 mm printers speak over RFCOMM. */
const SPP_UUID = "00001101-0000-1000-8000-00805f9b34fb";
/** Cheap printers overflow their buffer on large writes (04-printing.md checklist). */
const CHUNK_SIZE = 512;
/** Ignored over Bluetooth RFCOMM; the common default for USB-serial thermal printers. */
const BAUD_RATE = 9600;

const sameDevice = (a: PairedDevice, b: PairedDevice) =>
  a.usbVendorId === b.usbVendorId && a.usbProductId === b.usbProductId && a.bluetoothServiceClassId === b.bluetoothServiceClassId;

/**
 * Web Serial driver: Bluetooth Classic (SPP) printers on Chrome Android 137+ / Windows 117+ (paired
 * in the OS first) and USB virtual-COM printers. Two Bluetooth printers look identical to
 * `getInfo()`, so with several granted the first one wins.
 */
export function createWebSerialDriver(serial: SerialLike | undefined): PrinterDriver {
  let port: SerialPortLike | null = null;

  const open = async (candidate: SerialPortLike) => {
    await candidate.open({ baudRate: BAUD_RATE });
    port = candidate;
  };

  return {
    type: "web-serial",
    connection: "picker",
    isSupported: () => serial !== undefined,
    async pair() {
      if (!serial) throw new Error("PRINTER_UNSUPPORTED");
      const picked = await serial.requestPort({ allowedBluetoothServiceClassIds: [SPP_UUID] });
      await this.disconnect();
      await open(picked);
      return picked.getInfo();
    },
    async connect(device) {
      if (port && sameDevice(port.getInfo(), device)) return;
      if (!serial) throw new Error("PRINTER_UNSUPPORTED");
      const granted = (await serial.getPorts()).find((p) => sameDevice(p.getInfo(), device));
      if (!granted) throw new Error("PRINTER_NOT_PAIRED");
      await this.disconnect();
      await open(granted);
    },
    async send(data) {
      const writer = port?.writable?.getWriter();
      if (!writer) throw new Error("PRINTER_NOT_CONNECTED");
      try {
        for (let i = 0; i < data.length; i += CHUNK_SIZE) await writer.write(data.subarray(i, i + CHUNK_SIZE));
      } finally {
        writer.releaseLock();
      }
    },
    async disconnect() {
      const current = port;
      port = null;
      await current?.close().catch(() => undefined);
    },
  };
}
