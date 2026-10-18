import type { PrinterDriver } from "./printer-driver";

/** The slice of Web Bluetooth this driver uses (lib.dom has no Web Bluetooth types). */
export interface BleCharacteristicLike {
  uuid: string;
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse(value: Uint8Array): Promise<void>;
  writeValueWithoutResponse(value: Uint8Array): Promise<void>;
}

export interface BleDeviceLike {
  id: string;
  name?: string;
  gatt?: {
    readonly connected: boolean;
    connect(): Promise<{ getPrimaryServices(): Promise<{ uuid: string; getCharacteristics(): Promise<BleCharacteristicLike[]> }[]> }>;
    disconnect(): void;
  };
}

export interface BluetoothLike {
  requestDevice(options: { acceptAllDevices: true; optionalServices: string[] }): Promise<BleDeviceLike>;
  /** Behind a flag on some Chrome versions; without it a BLE printer must be paired again after a reload. */
  getDevices?(): Promise<BleDeviceLike[]>;
}

/** GATT services of common BLE thermal printers; a service must be listed to be reachable at all. */
export const PRINTER_SERVICES: string[] = [
  "000018f0-0000-1000-8000-00805f9b34fb", // generic 58 mm printers (characteristic 2af1)
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // many Chinese ESC/POS printers
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Microchip/ISSC transparent UART
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
];
/** Default BLE MTU payload; larger writes are silently dropped by cheap printers. */
const CHUNK_SIZE = 20;

/**
 * Web Bluetooth driver for BLE printers (Chrome Android & Windows). Writes with response when the
 * characteristic allows it — slower, but the printer acknowledges each chunk.
 */
export function createWebBluetoothDriver(bluetooth: BluetoothLike | undefined): PrinterDriver {
  let device: BleDeviceLike | null = null;
  let characteristic: BleCharacteristicLike | null = null;

  const open = async (candidate: BleDeviceLike) => {
    if (!candidate.gatt) throw new Error("PRINTER_NOT_WRITABLE");
    const server = await candidate.gatt.connect();
    const all = (await Promise.all((await server.getPrimaryServices()).map((s) => s.getCharacteristics()))).flat();
    const target = all.find((c) => c.properties.write) ?? all.find((c) => c.properties.writeWithoutResponse);
    if (!target) {
      candidate.gatt.disconnect();
      throw new Error("PRINTER_NOT_WRITABLE");
    }
    device = candidate;
    characteristic = target;
  };

  return {
    type: "web-bluetooth",
    connection: "picker",
    isSupported: () => bluetooth !== undefined,
    async pair() {
      if (!bluetooth) throw new Error("PRINTER_UNSUPPORTED");
      const picked = await bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
      await this.disconnect();
      await open(picked);
      return { bluetoothDeviceId: picked.id, ...(picked.name && { name: picked.name }) };
    },
    async connect(saved) {
      const current = device;
      if (current && current.id === saved.bluetoothDeviceId && current.gatt?.connected) return;
      if (!bluetooth?.getDevices) throw new Error("PRINTER_NOT_PAIRED");
      const granted = (await bluetooth.getDevices()).find((d) => d.id === saved.bluetoothDeviceId);
      if (!granted) throw new Error("PRINTER_NOT_PAIRED");
      await this.disconnect();
      await open(granted);
    },
    async send(data) {
      const target = characteristic;
      const current = device;
      if (!target || !current?.gatt?.connected) throw new Error("PRINTER_NOT_CONNECTED");
      for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        const chunk = data.slice(i, i + CHUNK_SIZE);
        await (target.properties.write ? target.writeValueWithResponse(chunk) : target.writeValueWithoutResponse(chunk));
      }
    },
    async disconnect() {
      const current = device;
      device = null;
      characteristic = null;
      if (current?.gatt?.connected) current.gatt.disconnect();
    },
  };
}
