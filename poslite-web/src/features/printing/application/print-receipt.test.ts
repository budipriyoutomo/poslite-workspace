import { beforeEach, describe, expect, it } from "vitest";

import { placeOrder } from "@/features/checkout";
import { openShift } from "@/features/shift";
import type { OrderRow, PosDb } from "@/shared/db";

import { IDS, seedOutlet, testDeps } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { renderText } from "../domain/text-layout";
import type { ReceiptPrinter } from "../infrastructure/receipt-printer";
import { printReceipt } from "./print-receipt";

let db: PosDb;
let order: OrderRow;

beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db);
  await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));
  order = await placeOrder(
    {
      cashier: { id: IDS.cashier, name: "Siti" },
      lines: [{ productId: IDS.gudeg, name: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, quantity: 1, note: "", modifiers: [] }],
      discount: null,
      payments: [{ paymentMethodId: IDS.cashMethod, amount: 50_000 }],
    },
    testDeps(db),
  );
});

const fakePrinter = (fail = false) => {
  const printed: string[][] = [];
  const printer: ReceiptPrinter = {
    print: async (doc, columns) => {
      if (fail) throw new Error("printer offline");
      printed.push(renderText(doc, columns));
    },
  };
  return { printer, printed };
};

describe("printReceipt", () => {
  it("prints the order's receipt and records the job as printed", async () => {
    const { printer, printed } = fakePrinter();
    expect(await printReceipt(order.id, { db, printer, now: () => new Date(), newId: () => "01J8Z00000000000000000JOB1" })).toBe(true);
    expect(printed[0]).toContain(`No   : ${order.receiptNo}`);
    expect(await db.printJobs.toArray()).toMatchObject([{ orderId: order.id, status: "printed", attempts: 1 }]);
  });

  it("never throws when the printer fails: the job is marked failed and the order is untouched", async () => {
    const { printer } = fakePrinter(true);
    expect(await printReceipt(order.id, { db, printer, now: () => new Date(), newId: () => "01J8Z00000000000000000JOB2" })).toBe(false);
    expect(await db.printJobs.toArray()).toMatchObject([{ status: "failed", lastError: "printer offline" }]);
    expect((await db.orders.get(order.id))?.status).toBe("paid");
  });

  it("heads the receipt with the brand name when no receipt header is set (ADR-022)", async () => {
    const outlet = (await db.settings.get("outlet"))!.value;
    await db.settings.put({ key: "outlet", value: { ...outlet, receiptHeader: "", brand: { id: "B", code: "SUSHI", name: "Maharasa Sushi", logoKey: null } } });
    const { printer, printed } = fakePrinter();

    await printReceipt(order.id, { db, printer, now: () => new Date(), newId: () => "01J8Z00000000000000000JOB3" });

    expect(printed[0]!.slice(0, 2).join("\n")).toContain("Maharasa Sushi");
  });
});
