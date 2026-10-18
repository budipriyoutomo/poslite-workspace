import { beforeEach, describe, expect, it } from "vitest";

import type { PosDb } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import type { ReceiptDocument } from "../domain/receipt-document";
import { renderText } from "../domain/text-layout";
import type { PairedDevice, PrinterDriver } from "../infrastructure/printer-driver";
import { choicesFor, getPrinter, pairPrinter, printTestPage, type PrinterSetupDeps, removePrinter, savePrinter, savePrinterAddress } from "./printer-setup";

const DEVICE: PairedDevice = { bluetoothServiceClassId: "00001101-0000-1000-8000-00805f9b34fb" };

let db: PosDb;
let deps: PrinterSetupDeps;
let printed: { doc: ReceiptDocument; columns: number }[];

function serial(isSupported = true): PrinterDriver {
  return { type: "web-serial", connection: "picker", isSupported: () => isSupported, pair: async () => DEVICE, connect: async () => undefined, send: async () => undefined, disconnect: async () => undefined };
}

beforeEach(() => {
  db = createTestDb();
  printed = [];
  let n = 0;
  deps = {
    db,
    printers: { system: { print: async (doc, columns) => void printed.push({ doc, columns }) }, drivers: { "web-serial": serial() } },
    newId: () => `01J8Z0000000000000000PRN${++n}`,
    now: () => new Date("2026-10-18T03:15:00.000Z"),
  };
});

describe("printer setup", () => {
  it("offers the system dialog plus only the connections this browser supports", () => {
    expect(choicesFor("receipt", deps.printers)).toEqual(["system", "web-serial"]);
    expect(choicesFor("receipt", { ...deps.printers, drivers: { "web-serial": serial(false) } })).toEqual(["system"]);
  });

  it("keeps one receipt printer per device, updated in place", async () => {
    await savePrinter({ driver: "system", paperWidth: 58 }, deps);
    await savePrinter({ driver: "system", paperWidth: 80 }, deps);

    expect(await db.printers.toArray()).toMatchObject([{ role: "receipt", driver: "system", paperWidth: 80 }]);
  });

  it("forgets the paired printer when the connection type changes", async () => {
    await savePrinter({ driver: "web-serial", paperWidth: 58 }, deps);
    await pairPrinter(deps);
    await savePrinter({ driver: "system", paperWidth: 58 }, deps);

    expect((await getPrinter(db))?.device).toBeUndefined();
  });

  it("keeps the paired printer when only the paper width changes", async () => {
    await savePrinter({ driver: "web-serial", paperWidth: 58 }, deps);
    await pairPrinter(deps);
    await savePrinter({ driver: "web-serial", paperWidth: 80 }, deps);

    expect((await getPrinter(db))?.device).toEqual(DEVICE);
  });

  it("saves the printer the cashier picked when pairing", async () => {
    await savePrinter({ driver: "web-serial", paperWidth: 58 }, deps);

    await pairPrinter(deps);

    expect(await getPrinter(db)).toMatchObject({ driver: "web-serial", device: DEVICE });
  });

  it("has nothing to pair for the system print dialog", async () => {
    await savePrinter({ driver: "system", paperWidth: 58 }, deps);

    await expect(pairPrinter(deps)).rejects.toThrow("PRINTER_NOT_PAIRABLE");
  });

  it("prints the test page on the configured printer at its paper width", async () => {
    await savePrinter({ driver: "system", paperWidth: 80 }, deps);

    await printTestPage(deps);

    expect(printed[0]!.columns).toBe(48);
    expect(renderText(printed[0]!.doc, 48)).toContain("Kertas : 80 mm (48 kolom)");
  });
});

describe("kitchen and bar printers", () => {
  it("can be left out, share the receipt printer, or use their own connection", () => {
    expect(choicesFor("kitchen", deps.printers)).toEqual(["none", "same-as-receipt", "system", "web-serial"]);
  });

  it("shares the receipt printer and its paper for the test page", async () => {
    await savePrinter({ driver: "system", paperWidth: 80 }, deps);
    await savePrinter({ role: "kitchen", driver: "same-as-receipt", paperWidth: 58 }, deps);

    await printTestPage(deps, "kitchen");

    expect(printed[0]!.columns).toBe(48);
  });

  it("pairs its own printer, apart from the receipt printer", async () => {
    await savePrinter({ driver: "system", paperWidth: 58 }, deps);
    await savePrinter({ role: "kitchen", driver: "web-serial", paperWidth: 80 }, deps);

    await pairPrinter(deps, "kitchen");

    expect(await getPrinter(db, "kitchen")).toMatchObject({ role: "kitchen", device: DEVICE });
    expect((await getPrinter(db))?.device).toBeUndefined();
  });

  it("stops printing tickets for a station set to none", async () => {
    await savePrinter({ role: "bar", driver: "system", paperWidth: 58 }, deps);

    await removePrinter("bar", deps);

    expect(await getPrinter(db, "bar")).toBeUndefined();
  });

  it("has nothing to pair when sharing the receipt printer", async () => {
    await savePrinter({ role: "kitchen", driver: "same-as-receipt", paperWidth: 58 }, deps);

    await expect(pairPrinter(deps, "kitchen")).rejects.toThrow("PRINTER_NOT_PAIRABLE");
  });
});

describe("LAN printers", () => {
  it("saves the address of an Epson ePOS printer as its device", async () => {
    await savePrinter({ role: "kitchen", driver: "epson-epos", paperWidth: 80 }, deps);

    await savePrinterAddress({ role: "kitchen", device: { address: " 192.168.1.50 " } }, deps);

    expect(await getPrinter(db, "kitchen")).toMatchObject({ driver: "epson-epos", device: { address: "192.168.1.50" } });
  });

  it("saves the bridge URL, token and printer address for a Print Bridge printer", async () => {
    await savePrinter({ driver: "bridge", paperWidth: 80 }, deps);

    await savePrinterAddress({ device: { bridgeUrl: "http://localhost:9180", bridgeToken: "s3cret", address: "192.168.1.60:9100" } }, deps);

    expect((await getPrinter(db))?.device).toEqual({ bridgeUrl: "http://localhost:9180", bridgeToken: "s3cret", address: "192.168.1.60:9100" });
  });

  it("refuses an empty address", async () => {
    await savePrinter({ driver: "epson-epos", paperWidth: 58 }, deps);

    await expect(savePrinterAddress({ device: { address: "  " } }, deps)).rejects.toThrow("PRINTER_ADDRESS_REQUIRED");
  });

  it("only takes an address for a LAN printer", async () => {
    await savePrinter({ driver: "system", paperWidth: 58 }, deps);

    await expect(savePrinterAddress({ device: { address: "192.168.1.50" } }, deps)).rejects.toThrow("PRINTER_NOT_PAIRABLE");
  });
});
