import { describe, expect, it } from "vitest";

import { createWebUsbDriver, type UsbDeviceLike, type UsbInterfaceLike, type UsbLike } from "./web-usb-driver";

const PRINTER_CLASS = 7;
const VENDOR_CLASS = 0xff;

const iface = (interfaceNumber: number, interfaceClass: number, endpoints: UsbInterfaceLike["alternate"]["endpoints"]): UsbInterfaceLike => ({
  interfaceNumber,
  alternate: { interfaceClass, endpoints },
});

function fakeUsb(info: { vendorId: number; productId: number; serialNumber?: string }, interfaces: UsbInterfaceLike[], { transferStatus = "ok" as "ok" | "stall" } = {}) {
  const transfers: { endpoint: number; data: Uint8Array }[] = [];
  const claimed: number[] = [];
  const selected: number[] = [];
  let opens = 0;
  let configured = false;
  const device: UsbDeviceLike = {
    ...info,
    productName: "POS-58",
    opened: false,
    get configuration() {
      return configured ? { configurationValue: 1, interfaces } : null;
    },
    async open() {
      opens++;
      this.opened = true;
    },
    async close() {
      this.opened = false;
    },
    selectConfiguration: async (value) => {
      selected.push(value);
      configured = true;
    },
    claimInterface: async (n) => void claimed.push(n),
    transferOut: async (endpoint, data) => {
      transfers.push({ endpoint, data: new Uint8Array(data) });
      return { status: transferStatus };
    },
  };
  return { device, transfers, claimed, selected, opens: () => opens };
}

function fakeNavigatorUsb(granted: UsbDeviceLike[], picked?: UsbDeviceLike) {
  const requests: unknown[] = [];
  const usb: UsbLike = {
    getDevices: async () => granted,
    requestDevice: async (options) => {
      requests.push(options);
      if (!picked) throw new DOMException("No device selected.", "NotFoundError");
      return picked;
    },
  };
  return { usb, requests };
}

const PRINTER = { vendorId: 0x0416, productId: 0x5011, serialNumber: "SN1" };
const printerInterfaces = () => [iface(0, VENDOR_CLASS, [{ endpointNumber: 1, direction: "in", type: "bulk" }]), iface(1, PRINTER_CLASS, [{ endpointNumber: 3, direction: "out", type: "bulk" }])];

describe("web-usb driver", () => {
  it("is unsupported when the browser has no WebUSB", () => {
    expect(createWebUsbDriver(undefined).isSupported()).toBe(false);
    expect(createWebUsbDriver(fakeNavigatorUsb([]).usb).isSupported()).toBe(true);
  });

  it("pairs with a device the cashier picks and claims its printer interface", async () => {
    const printer = fakeUsb(PRINTER, printerInterfaces());
    const { usb, requests } = fakeNavigatorUsb([], printer.device);

    expect(await createWebUsbDriver(usb).pair()).toEqual({ usbVendorId: 0x0416, usbProductId: 0x5011, usbSerialNumber: "SN1", name: "POS-58" });
    expect(requests).toEqual([{ filters: [] }]);
    expect(printer.selected).toEqual([1]);
    expect(printer.claimed).toEqual([1]);
  });

  it("reconnects without a dialog to the saved device", async () => {
    const other = fakeUsb({ ...PRINTER, serialNumber: "SN0" }, printerInterfaces());
    const printer = fakeUsb(PRINTER, printerInterfaces());
    const { usb, requests } = fakeNavigatorUsb([other.device, printer.device]);

    await createWebUsbDriver(usb).connect({ usbVendorId: 0x0416, usbProductId: 0x5011, usbSerialNumber: "SN1" });

    expect(printer.device.opened).toBe(true);
    expect(other.device.opened).toBe(false);
    expect(requests).toEqual([]);
  });

  it("refuses to connect when the saved device is no longer granted", async () => {
    await expect(createWebUsbDriver(fakeNavigatorUsb([]).usb).connect({ usbVendorId: 1, usbProductId: 2 })).rejects.toThrow("PRINTER_NOT_PAIRED");
  });

  it("does not reopen a device that is already connected", async () => {
    const printer = fakeUsb(PRINTER, printerInterfaces());
    const driver = createWebUsbDriver(fakeNavigatorUsb([printer.device]).usb);

    await driver.connect({ usbVendorId: 0x0416, usbProductId: 0x5011, usbSerialNumber: "SN1" });
    await driver.connect({ usbVendorId: 0x0416, usbProductId: 0x5011, usbSerialNumber: "SN1" });

    expect(printer.opens()).toBe(1);
  });

  it("sends to the bulk OUT endpoint in chunks of at most 512 bytes", async () => {
    const printer = fakeUsb(PRINTER, printerInterfaces());
    const driver = createWebUsbDriver(fakeNavigatorUsb([printer.device]).usb);
    const data = Uint8Array.from({ length: 700 }, (_, i) => i % 256);

    await driver.connect({ usbVendorId: 0x0416, usbProductId: 0x5011, usbSerialNumber: "SN1" });
    await driver.send(data);

    expect(printer.transfers.map((t) => [t.endpoint, t.data.length])).toEqual([[3, 512], [3, 188]]);
    expect(Uint8Array.from(printer.transfers.flatMap((t) => [...t.data]))).toEqual(data);
  });

  it("falls back to any interface with a bulk OUT endpoint (vendor-class printers)", async () => {
    const printer = fakeUsb(PRINTER, [iface(0, VENDOR_CLASS, [{ endpointNumber: 2, direction: "out", type: "bulk" }])]);
    const driver = createWebUsbDriver(fakeNavigatorUsb([printer.device]).usb);

    await driver.connect({ usbVendorId: 0x0416, usbProductId: 0x5011, usbSerialNumber: "SN1" });
    await driver.send(new Uint8Array([1]));

    expect(printer.transfers.map((t) => t.endpoint)).toEqual([2]);
  });

  it("explains a device it cannot print to", async () => {
    const printer = fakeUsb(PRINTER, [iface(0, 3, [{ endpointNumber: 1, direction: "in", type: "interrupt" }])]);

    await expect(createWebUsbDriver(fakeNavigatorUsb([printer.device]).usb).connect({ usbVendorId: 0x0416, usbProductId: 0x5011, usbSerialNumber: "SN1" })).rejects.toThrow(
      "PRINTER_NOT_WRITABLE",
    );
  });

  it("fails a transfer the printer did not accept", async () => {
    const printer = fakeUsb(PRINTER, printerInterfaces(), { transferStatus: "stall" });
    const driver = createWebUsbDriver(fakeNavigatorUsb([printer.device]).usb);

    await driver.connect({ usbVendorId: 0x0416, usbProductId: 0x5011, usbSerialNumber: "SN1" });

    await expect(driver.send(new Uint8Array([1]))).rejects.toThrow("USB transfer stall");
  });

  it("refuses to send before connecting", async () => {
    await expect(createWebUsbDriver(fakeNavigatorUsb([]).usb).send(new Uint8Array([1]))).rejects.toThrow("PRINTER_NOT_CONNECTED");
  });

  it("closes the device on disconnect", async () => {
    const printer = fakeUsb(PRINTER, printerInterfaces());
    const driver = createWebUsbDriver(fakeNavigatorUsb([printer.device]).usb);

    await driver.connect({ usbVendorId: 0x0416, usbProductId: 0x5011, usbSerialNumber: "SN1" });
    await driver.disconnect();

    expect(printer.device.opened).toBe(false);
  });
});
