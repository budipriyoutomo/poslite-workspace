import { beforeEach, describe, expect, it } from "vitest";

import type { PosDb } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import type { ReceiptDocument } from "../domain/receipt-document";
import type { PairedDevice, PrinterDriver } from "../infrastructure/printer-driver";
import type { ReceiptPrinter } from "../infrastructure/receipt-printer";
import { createConfiguredPrinter } from "./configured-printer";

const DEVICE: PairedDevice = { usbVendorId: 0x0416, usbProductId: 0x5011 };
const DOC: ReceiptDocument = [{ kind: "text", text: "TOTAL" }];

let db: PosDb;
beforeEach(() => {
  db = createTestDb();
});

function fakes(isSupported = true) {
  const systemCalls: number[] = [];
  const connected: PairedDevice[] = [];
  const sent: Uint8Array[] = [];
  const system: ReceiptPrinter = { print: async (_doc, columns) => void systemCalls.push(columns) };
  const serial: PrinterDriver = {
    type: "web-serial",
    connection: "picker",
    isSupported: () => isSupported,
    pair: async () => DEVICE,
    connect: async (device) => void connected.push(device),
    send: async (data) => void sent.push(data),
    disconnect: async () => undefined,
  };
  return { system, serial, systemCalls, connected, sent };
}

const saveSerialPrinter = (device?: PairedDevice) =>
  db.printers.put({ id: "P1", role: "receipt", driver: "web-serial", name: "RPP02N", paperWidth: 58, ...(device && { device }) });

describe("configured receipt printer", () => {
  it("uses the system print dialog when no receipt printer is set up", async () => {
    const f = fakes();

    await createConfiguredPrinter(db, { system: f.system, drivers: { "web-serial": f.serial } }).print(DOC, 32);

    expect(f.systemCalls).toEqual([32]);
  });

  it("sends ESC/POS to the paired printer of the configured driver", async () => {
    await saveSerialPrinter(DEVICE);
    const f = fakes();

    await createConfiguredPrinter(db, { system: f.system, drivers: { "web-serial": f.serial } }).print(DOC, 32);

    expect(f.connected).toEqual([DEVICE]);
    expect([...f.sent[0]!.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect(f.systemCalls).toEqual([]);
  });

  it("fails clearly when the printer was configured but never paired", async () => {
    await saveSerialPrinter();
    const f = fakes();

    await expect(createConfiguredPrinter(db, { system: f.system, drivers: { "web-serial": f.serial } }).print(DOC, 32)).rejects.toThrow("PRINTER_NOT_PAIRED");
  });

  it("prints a kitchen ticket on the kitchen printer's own connection", async () => {
    await db.printers.bulkPut([
      { id: "P1", role: "receipt", driver: "system", name: "Sistem", paperWidth: 58 },
      { id: "P2", role: "kitchen", driver: "web-serial", name: "Dapur", paperWidth: 80, device: DEVICE },
    ]);
    const f = fakes();

    await createConfiguredPrinter(db, { system: f.system, drivers: { "web-serial": f.serial } }, "kitchen").print(DOC, 48);

    expect(f.sent).toHaveLength(1);
    expect(f.systemCalls).toEqual([]);
  });

  it("prints a kitchen ticket on the receipt printer when the kitchen shares it", async () => {
    await db.printers.bulkPut([
      { id: "P1", role: "receipt", driver: "web-serial", name: "Kasir", paperWidth: 58, device: DEVICE },
      { id: "P2", role: "kitchen", driver: "same-as-receipt", name: "Printer struk", paperWidth: 58 },
    ]);
    const f = fakes();

    await createConfiguredPrinter(db, { system: f.system, drivers: { "web-serial": f.serial } }, "kitchen").print(DOC, 32);

    expect(f.connected).toEqual([DEVICE]);
    expect(f.sent).toHaveLength(1);
  });

  it("fails clearly when this browser cannot use the configured connection", async () => {
    await saveSerialPrinter(DEVICE);
    const f = fakes(false);

    await expect(createConfiguredPrinter(db, { system: f.system, drivers: { "web-serial": f.serial } }).print(DOC, 32)).rejects.toThrow("PRINTER_UNSUPPORTED");
  });
});
