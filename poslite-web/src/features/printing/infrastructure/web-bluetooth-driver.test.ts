import { describe, expect, it } from "vitest";

import { type BleCharacteristicLike, type BleDeviceLike, type BluetoothLike, createWebBluetoothDriver, PRINTER_SERVICES } from "./web-bluetooth-driver";

function fakeCharacteristic(uuid: string, properties: { write?: boolean; writeWithoutResponse?: boolean }) {
  const writes: Uint8Array[] = [];
  const characteristic: BleCharacteristicLike = {
    uuid,
    properties: { write: properties.write ?? false, writeWithoutResponse: properties.writeWithoutResponse ?? false },
    writeValueWithResponse: async (value) => void writes.push(new Uint8Array(value)),
    writeValueWithoutResponse: async (value) => void writes.push(new Uint8Array(value)),
  };
  return { characteristic, writes };
}

function fakeDevice(id: string, characteristics: BleCharacteristicLike[]) {
  let connects = 0;
  let isConnected = false;
  const device: BleDeviceLike = {
    id,
    name: `Printer ${id}`,
    gatt: {
      get connected() {
        return isConnected;
      },
      connect: async () => {
        connects++;
        isConnected = true;
        return { getPrimaryServices: async () => [{ uuid: PRINTER_SERVICES[0]!, getCharacteristics: async () => characteristics }] };
      },
      disconnect: () => {
        isConnected = false;
      },
    },
  };
  return { device, connects: () => connects, isConnected: () => isConnected, powerOff: () => (isConnected = false) };
}

function fakeBluetooth(granted: BleDeviceLike[], picked?: BleDeviceLike, { hasGetDevices = true } = {}) {
  const requests: unknown[] = [];
  const bluetooth: BluetoothLike = {
    requestDevice: async (options) => {
      requests.push(options);
      if (!picked) throw new DOMException("User cancelled the requestDevice() chooser.", "NotFoundError");
      return picked;
    },
    ...(hasGetDevices && { getDevices: async () => granted }),
  };
  return { bluetooth, requests };
}

const writable = () => fakeCharacteristic("00002af1-0000-1000-8000-00805f9b34fb", { write: true });

describe("web-bluetooth driver", () => {
  it("is unsupported when the browser has no Web Bluetooth", () => {
    expect(createWebBluetoothDriver(undefined).isSupported()).toBe(false);
    expect(createWebBluetoothDriver(fakeBluetooth([]).bluetooth).isSupported()).toBe(true);
  });

  it("pairs with a device the cashier picks, asking for the known printer services", async () => {
    const printer = fakeDevice("BLE-1", [writable().characteristic]);
    const { bluetooth, requests } = fakeBluetooth([], printer.device);

    expect(await createWebBluetoothDriver(bluetooth).pair()).toEqual({ bluetoothDeviceId: "BLE-1", name: "Printer BLE-1" });
    expect(requests).toEqual([{ acceptAllDevices: true, optionalServices: PRINTER_SERVICES }]);
    expect(printer.isConnected()).toBe(true);
  });

  it("reconnects without a dialog to the saved device", async () => {
    const other = fakeDevice("BLE-0", [writable().characteristic]);
    const printer = fakeDevice("BLE-1", [writable().characteristic]);
    const { bluetooth, requests } = fakeBluetooth([other.device, printer.device]);

    await createWebBluetoothDriver(bluetooth).connect({ bluetoothDeviceId: "BLE-1" });

    expect(printer.isConnected()).toBe(true);
    expect(other.isConnected()).toBe(false);
    expect(requests).toEqual([]);
  });

  it("needs pairing again when the browser cannot list granted devices", async () => {
    const { bluetooth } = fakeBluetooth([], undefined, { hasGetDevices: false });

    await expect(createWebBluetoothDriver(bluetooth).connect({ bluetoothDeviceId: "BLE-1" })).rejects.toThrow("PRINTER_NOT_PAIRED");
  });

  it("refuses to connect when the saved device is no longer granted", async () => {
    const { bluetooth } = fakeBluetooth([]);

    await expect(createWebBluetoothDriver(bluetooth).connect({ bluetoothDeviceId: "BLE-1" })).rejects.toThrow("PRINTER_NOT_PAIRED");
  });

  it("reconnects the same device after the printer was switched off", async () => {
    const printer = fakeDevice("BLE-1", [writable().characteristic]);
    const driver = createWebBluetoothDriver(fakeBluetooth([printer.device]).bluetooth);

    await driver.connect({ bluetoothDeviceId: "BLE-1" });
    await driver.connect({ bluetoothDeviceId: "BLE-1" });
    expect(printer.connects()).toBe(1);
    printer.powerOff();
    await driver.connect({ bluetoothDeviceId: "BLE-1" });

    expect(printer.connects()).toBe(2);
  });

  it("writes to the printer's writable characteristic in 20-byte chunks, in order", async () => {
    const readOnly = fakeCharacteristic("00002af0-0000-1000-8000-00805f9b34fb", {});
    const target = writable();
    const printer = fakeDevice("BLE-1", [readOnly.characteristic, target.characteristic]);
    const driver = createWebBluetoothDriver(fakeBluetooth([printer.device]).bluetooth);
    const data = Uint8Array.from({ length: 45 }, (_, i) => i);

    await driver.connect({ bluetoothDeviceId: "BLE-1" });
    await driver.send(data);

    expect(target.writes.map((c) => c.length)).toEqual([20, 20, 5]);
    expect(Uint8Array.from(target.writes.flatMap((c) => [...c]))).toEqual(data);
    expect(readOnly.writes).toEqual([]);
  });

  it("uses write-without-response when that is all the printer offers", async () => {
    const target = fakeCharacteristic("49535343-8841-43f4-a8d4-ecbe34729bb3", { writeWithoutResponse: true });
    const printer = fakeDevice("BLE-1", [target.characteristic]);
    const driver = createWebBluetoothDriver(fakeBluetooth([printer.device]).bluetooth);

    await driver.connect({ bluetoothDeviceId: "BLE-1" });
    await driver.send(new Uint8Array([1, 2, 3]));

    expect(target.writes).toEqual([new Uint8Array([1, 2, 3])]);
  });

  it("explains a device that is not a printer", async () => {
    const printer = fakeDevice("BLE-1", [fakeCharacteristic("00002a19-0000-1000-8000-00805f9b34fb", {}).characteristic]);

    await expect(createWebBluetoothDriver(fakeBluetooth([printer.device]).bluetooth).connect({ bluetoothDeviceId: "BLE-1" })).rejects.toThrow("PRINTER_NOT_WRITABLE");
  });

  it("refuses to send before connecting", async () => {
    await expect(createWebBluetoothDriver(fakeBluetooth([]).bluetooth).send(new Uint8Array([1]))).rejects.toThrow("PRINTER_NOT_CONNECTED");
  });

  it("disconnects the GATT server", async () => {
    const printer = fakeDevice("BLE-1", [writable().characteristic]);
    const driver = createWebBluetoothDriver(fakeBluetooth([printer.device]).bluetooth);

    await driver.connect({ bluetoothDeviceId: "BLE-1" });
    await driver.disconnect();

    expect(printer.isConnected()).toBe(false);
  });
});
