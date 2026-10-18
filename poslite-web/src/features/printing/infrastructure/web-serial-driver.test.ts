import { describe, expect, it } from "vitest";

import { createWebSerialDriver, type SerialLike, type SerialPortLike } from "./web-serial-driver";

const SPP = "00001101-0000-1000-8000-00805f9b34fb";

function fakePort(info: ReturnType<SerialPortLike["getInfo"]>) {
  const writes: Uint8Array[] = [];
  let openCount = 0;
  let isOpen = false;
  const port: SerialPortLike = {
    getInfo: () => info,
    open: async () => {
      if (isOpen) throw new Error("InvalidStateError: port already open");
      isOpen = true;
      openCount++;
    },
    close: async () => {
      isOpen = false;
    },
    get writable() {
      return isOpen ? { getWriter: () => ({ write: async (chunk: Uint8Array) => void writes.push(chunk), releaseLock: () => undefined }) } : null;
    },
  };
  return { port, writes, opens: () => openCount, isOpen: () => isOpen };
}

function fakeSerial(granted: SerialPortLike[], picked?: SerialPortLike) {
  const requests: unknown[] = [];
  const serial: SerialLike = {
    getPorts: async () => granted,
    requestPort: async (options) => {
      requests.push(options);
      if (!picked) throw new DOMException("No port selected by the user.", "NotFoundError");
      return picked;
    },
  };
  return { serial, requests };
}

const BT_PRINTER = { bluetoothServiceClassId: SPP };
const USB_PRINTER = { usbVendorId: 0x0416, usbProductId: 0x5011 };

describe("web-serial driver", () => {
  it("is unsupported when the browser has no Web Serial", () => {
    expect(createWebSerialDriver(undefined).isSupported()).toBe(false);
    expect(createWebSerialDriver(fakeSerial([]).serial).isSupported()).toBe(true);
  });

  it("pairs with a port the cashier picks, offering Bluetooth Classic printers too", async () => {
    const usb = fakePort(USB_PRINTER);
    const { serial, requests } = fakeSerial([], usb.port);

    const device = await createWebSerialDriver(serial).pair();

    expect(requests).toEqual([{ allowedBluetoothServiceClassIds: [SPP] }]);
    expect(device).toEqual(USB_PRINTER);
    expect(usb.isOpen()).toBe(true);
  });

  it("reconnects without a dialog to the previously granted port that matches", async () => {
    const usb = fakePort(USB_PRINTER);
    const bt = fakePort(BT_PRINTER);
    const { serial, requests } = fakeSerial([usb.port, bt.port]);

    await createWebSerialDriver(serial).connect(BT_PRINTER);

    expect(bt.isOpen()).toBe(true);
    expect(usb.isOpen()).toBe(false);
    expect(requests).toEqual([]);
  });

  it("refuses to connect when the saved printer is no longer granted", async () => {
    const { serial } = fakeSerial([fakePort(USB_PRINTER).port]);

    await expect(createWebSerialDriver(serial).connect(BT_PRINTER)).rejects.toThrow("PRINTER_NOT_PAIRED");
  });

  it("does not reopen a port that is already connected", async () => {
    const bt = fakePort(BT_PRINTER);
    const driver = createWebSerialDriver(fakeSerial([bt.port]).serial);

    await driver.connect(BT_PRINTER);
    await driver.connect(BT_PRINTER);

    expect(bt.opens()).toBe(1);
  });

  it("sends data in chunks of at most 512 bytes, in order", async () => {
    const bt = fakePort(BT_PRINTER);
    const driver = createWebSerialDriver(fakeSerial([bt.port]).serial);
    const data = Uint8Array.from({ length: 1300 }, (_, i) => i % 256);

    await driver.connect(BT_PRINTER);
    await driver.send(data);

    expect(bt.writes.map((c) => c.length)).toEqual([512, 512, 276]);
    expect(Uint8Array.from(bt.writes.flatMap((c) => [...c]))).toEqual(data);
  });

  it("refuses to send before connecting", async () => {
    await expect(createWebSerialDriver(fakeSerial([]).serial).send(new Uint8Array([1]))).rejects.toThrow("PRINTER_NOT_CONNECTED");
  });

  it("closes the port on disconnect so the next connect opens it again", async () => {
    const bt = fakePort(BT_PRINTER);
    const driver = createWebSerialDriver(fakeSerial([bt.port]).serial);

    await driver.connect(BT_PRINTER);
    await driver.disconnect();
    await driver.connect(BT_PRINTER);

    expect(bt.opens()).toBe(2);
  });
});
