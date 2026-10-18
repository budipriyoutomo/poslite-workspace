import { beforeEach, describe, expect, it } from "vitest";

import type { PosDb } from "@/shared/db";

import { seedOutlet } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { renderText } from "../domain/text-layout";
import type { ReceiptPrinter } from "../infrastructure/receipt-printer";
import type { PrinterRole } from "./configured-printer";
import { type KitchenOrder, type KitchenPrintDeps, printKitchenTickets } from "./print-kitchen";

let db: PosDb;
let printed: { role: PrinterRole; lines: string[] }[];
let brokenRoles: PrinterRole[];

const product = (id: string, categoryId: string, name: string) => ({ id, categoryId, sku: id, name, price: 10_000, imageKey: null, isAvailable: true, modifierGroupIds: [] });

beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db);
  await db.categories.bulkPut([
    { id: "C-FOOD", name: "Makanan", sortOrder: 1, printRole: "kitchen" },
    { id: "C-DRINK", name: "Minuman", sortOrder: 2, printRole: "bar" },
    { id: "C-MERCH", name: "Merchandise", sortOrder: 3, printRole: "receipt" },
  ]);
  await db.products.bulkPut([product("P-GUDEG", "C-FOOD", "Nasi Gudeg"), product("P-TEH", "C-DRINK", "Es Teh"), product("P-TOTE", "C-MERCH", "Tote Bag")]);
  await db.printers.bulkPut([
    { id: "PR-K", role: "kitchen", driver: "system", name: "Dapur", paperWidth: 58 },
    { id: "PR-B", role: "bar", driver: "system", name: "Bar", paperWidth: 80 },
  ]);
  printed = [];
  brokenRoles = [];
});

let n = 0;
const deps = (): KitchenPrintDeps => ({
  db,
  printerFor: (role): ReceiptPrinter => ({
    print: async (doc, columns) => {
      if (brokenRoles.includes(role)) throw new Error("printer offline");
      printed.push({ role, lines: renderText(doc, columns) });
    },
  }),
  now: () => new Date("2026-09-25T04:03:00.000Z"),
  newId: () => `01J8Z0000000000000000KT${String(++n).padStart(3, "0")}`,
});

const order: KitchenOrder = {
  refId: "01J8Z0000000000000000BILL1",
  reference: "Bill A1",
  tableLabel: "A1",
  cashierName: "Siti",
  isAddition: false,
  lines: [
    { key: "k1", productId: "P-GUDEG", name: "Nasi Gudeg", quantity: 2, modifiers: [], note: "" },
    { key: "k2", productId: "P-TEH", name: "Es Teh", quantity: 1, modifiers: [], note: "" },
    { key: "k3", productId: "P-TOTE", name: "Tote Bag", quantity: 1, modifiers: [], note: "" },
  ],
};

describe("printKitchenTickets", () => {
  it("sends food to the kitchen printer and drinks to the bar printer", async () => {
    await printKitchenTickets(order, deps());

    expect(printed.map((p) => p.role)).toEqual(["kitchen", "bar"]);
    expect(printed[0]!.lines).toContain("2x Nasi Gudeg");
    expect(printed[0]!.lines).not.toContain("1x Es Teh");
    expect(printed[1]!.lines).toContain("1x Es Teh");
  });

  it("prints each station at its own paper width", async () => {
    await printKitchenTickets(order, deps());

    expect(printed[1]!.lines.at(-1)).toHaveLength(48);
  });

  it("counts every line as sent when all stations printed, including items that need no ticket", async () => {
    expect(await printKitchenTickets(order, deps())).toEqual({ sentKeys: ["k1", "k2", "k3"], hasFailed: false });
  });

  it("skips a station without a printer on this device, as sent", async () => {
    await db.printers.delete("PR-B");

    expect(await printKitchenTickets(order, deps())).toEqual({ sentKeys: ["k1", "k2", "k3"], hasFailed: false });
    expect(printed.map((p) => p.role)).toEqual(["kitchen"]);
  });

  it("leaves a failed station's lines unsent so they are tried again, without stopping the other station", async () => {
    brokenRoles = ["kitchen"];

    expect(await printKitchenTickets(order, deps())).toEqual({ sentKeys: ["k2", "k3"], hasFailed: true });
    expect(printed.map((p) => p.role)).toEqual(["bar"]);
  });

  it("records each ticket as a kitchen-ticket print job", async () => {
    await printKitchenTickets(order, deps());

    expect(await db.printJobs.toArray()).toMatchObject([
      { orderId: order.refId, documentType: "kitchen_ticket", status: "printed" },
      { orderId: order.refId, documentType: "kitchen_ticket", status: "printed" },
    ]);
  });

  it("prints nothing when no line needs the kitchen or bar", async () => {
    expect(await printKitchenTickets({ ...order, lines: [order.lines[2]!] }, deps())).toEqual({ sentKeys: ["k3"], hasFailed: false });
    expect(printed).toEqual([]);
  });
});
