import type { PrinterDriver } from "./printer-driver";

/** The slice of WebUSB this driver uses (lib.dom has no WebUSB types). */
export interface UsbInterfaceLike {
  interfaceNumber: number;
  alternate: { interfaceClass: number; endpoints: { endpointNumber: number; direction: "in" | "out"; type: "bulk" | "interrupt" | "isochronous" }[] };
}

export interface UsbDeviceLike {
  vendorId: number;
  productId: number;
  serialNumber?: string;
  productName?: string;
  opened: boolean;
  readonly configuration: { configurationValue: number; interfaces: UsbInterfaceLike[] } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: Uint8Array): Promise<{ status: "ok" | "stall" | "babble" }>;
}

export interface UsbLike {
  getDevices(): Promise<UsbDeviceLike[]>;
  requestDevice(options: { filters: object[] }): Promise<UsbDeviceLike>;
}

const PRINTER_CLASS = 7;
const CHUNK_SIZE = 512;

const bulkOut = (i: UsbInterfaceLike) => i.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk");

/**
 * WebUSB driver for USB printers on Chrome Android. On Windows the OS printer driver owns the
 * device (WinUSB/Zadig needed), so USB there stays on the system print dialog (04-printing.md).
 */
export function createWebUsbDriver(usb: UsbLike | undefined): PrinterDriver {
  let device: UsbDeviceLike | null = null;
  let endpoint = 0;

  const open = async (candidate: UsbDeviceLike) => {
    await candidate.open();
    if (!candidate.configuration) await candidate.selectConfiguration(1);
    const interfaces = candidate.configuration?.interfaces ?? [];
    const target = interfaces.find((i) => i.alternate.interfaceClass === PRINTER_CLASS && bulkOut(i)) ?? interfaces.find((i) => bulkOut(i));
    const out = target && bulkOut(target);
    if (!target || !out) {
      await candidate.close();
      throw new Error("PRINTER_NOT_WRITABLE");
    }
    await candidate.claimInterface(target.interfaceNumber);
    device = candidate;
    endpoint = out.endpointNumber;
  };

  return {
    type: "web-usb",
    connection: "picker",
    isSupported: () => usb !== undefined,
    async pair() {
      if (!usb) throw new Error("PRINTER_UNSUPPORTED");
      const picked = await usb.requestDevice({ filters: [] });
      await this.disconnect();
      await open(picked);
      return {
        usbVendorId: picked.vendorId,
        usbProductId: picked.productId,
        ...(picked.serialNumber && { usbSerialNumber: picked.serialNumber }),
        ...(picked.productName && { name: picked.productName }),
      };
    },
    async connect(saved) {
      const matches = (d: UsbDeviceLike) => d.vendorId === saved.usbVendorId && d.productId === saved.usbProductId && (d.serialNumber ?? undefined) === saved.usbSerialNumber;
      if (device?.opened && matches(device)) return;
      if (!usb) throw new Error("PRINTER_UNSUPPORTED");
      const granted = (await usb.getDevices()).find(matches);
      if (!granted) throw new Error("PRINTER_NOT_PAIRED");
      await this.disconnect();
      await open(granted);
    },
    async send(data) {
      if (!device?.opened) throw new Error("PRINTER_NOT_CONNECTED");
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const { status } = await device.transferOut(endpoint, data.slice(i, i + CHUNK_SIZE));
        if (status !== "ok") throw new Error(`USB transfer ${status}`);
      }
    },
    async disconnect() {
      const current = device;
      device = null;
      if (current?.opened) await current.close().catch(() => undefined);
    },
  };
}
