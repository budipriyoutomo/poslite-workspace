import { beforeEach, describe, expect, it } from "vitest";

import type { PosDb } from "@/shared/db";

import { seedOutlet } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { renderText } from "../domain/text-layout";
import { printGuestCheck } from "./print-guest-check";
import type { PrintDeps } from "./print-receipt";

let db: PosDb;
let printed: string[][];
let isPrinterOn: boolean;

beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db);
  printed = [];
  isPrinterOn = true;
});

const deps = (): PrintDeps => ({
  db,
  printer: {
    print: async (doc, columns) => {
      if (!isPrinterOn) throw new Error("printer offline");
      printed.push(renderText(doc, columns));
    },
  },
  now: () => new Date("2026-09-25T05:00:00.000Z"),
  newId: () => "01J8Z0000000000000000JOB01",
});

const check = {
  billId: "B1",
  tableLabel: "A1",
  guestCount: 2,
  printedBy: "Siti",
  lines: [{ productName: "Es Teh", quantity: 2, unitPrice: 5_000, notes: "", modifiers: [] }],
  discount: null,
  rates: { serviceBps: 0, taxBps: 0 },
  subtotal: 10_000,
  discountAmount: 0,
  serviceCharge: 0,
  tax: 0,
  total: 10_000,
};

describe("printGuestCheck (15 · UX-04)", () => {
  it("prints the table's bill on the receipt printer and records the job", async () => {
    expect(await printGuestCheck(check, deps())).toBe(true);

    expect(printed[0]).toContain("Meja : A1 (2 tamu)");
    expect(await db.printJobs.toArray()).toMatchObject([{ orderId: "B1", documentType: "guest_check", status: "printed" }]);
  });

  it("reports a failed print without throwing", async () => {
    isPrinterOn = false;
    expect(await printGuestCheck(check, deps())).toBe(false);
  });
});
