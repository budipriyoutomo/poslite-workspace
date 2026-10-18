import { beforeEach, describe, expect, it } from "vitest";

import { placeOrder } from "@/features/checkout";
import { openShift } from "@/features/shift";
import type { OrderRow, PosDb, RefundRow } from "@/shared/db";

import { IDS, seedOutlet, testDeps } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { renderText } from "../domain/text-layout";
import type { ReceiptPrinter } from "../infrastructure/receipt-printer";
import type { PrintDeps } from "./print-receipt";
import { printRefundSlip, printVoidSlip } from "./print-slips";

let db: PosDb;
let order: OrderRow;
let printed: string[][];
let isPrinterOn: boolean;

const user = (id: string, name: string, role: "cashier" | "manager") => ({ id, name, role, pinHash: "", pinSalt: "", pinIterations: 1 });

beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db);
  await db.users.bulkPut([user(IDS.cashier, "Siti", "cashier"), user(IDS.manager, "Bu Rina", "manager")]);
  await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));
  order = await placeOrder(
    {
      cashier: { id: IDS.cashier, name: "Siti" },
      lines: [{ productId: IDS.gudeg, name: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, quantity: 2, note: "", modifiers: [] }],
      discount: null,
      payments: [{ paymentMethodId: IDS.qrisMethod, amount: 57_750 }],
    },
    testDeps(db),
  );
  printed = [];
  isPrinterOn = true;
});

let jobN = 0;
function deps(): PrintDeps {
  const printer: ReceiptPrinter = {
    print: async (doc, columns) => {
      if (!isPrinterOn) throw new Error("printer offline");
      printed.push(renderText(doc, columns));
    },
  };
  return { db, printer, now: () => new Date("2026-09-25T05:00:00.000Z"), newId: () => `01J8Z0000000000000000JOB${String(++jobN).padStart(2, "0")}` };
}

const voidIt = (approvedBy: string | null = IDS.manager) =>
  db.orders.update(order.id, { status: "voided", voidedAt: "2026-09-25T04:20:00.000Z", voidReason: "Salah input", voidedBy: IDS.cashier, voidApprovedBy: approvedBy });

const REFUND: RefundRow = {
  id: "01J8Z0000000000000000REF01",
  orderId: "",
  receiptNo: "",
  shiftId: "",
  refundNo: "JKT01A-R260925-0001",
  businessDate: "2026-09-25",
  reason: "Pelanggan komplain",
  refundedBy: IDS.cashier,
  approvedBy: IDS.manager,
  lines: [{ orderLineId: "L1", productName: "Nasi Gudeg", quantity: 1, amount: 28_875 }],
  total: 28_875,
  payments: [{ id: "RP1", paymentMethodId: IDS.cashMethod, methodType: "cash", methodName: "Tunai", amount: 28_875, reference: null }],
  syncStatus: "pending",
  flags: [],
  createdAt: "2026-09-25T04:30:00.000Z",
};

describe("printVoidSlip", () => {
  it("prints who voided, who approved and the reminder for non-cash payments", async () => {
    await voidIt();

    expect(await printVoidSlip(order.id, deps())).toBe(true);

    const text = printed[0]!.join("\n");
    expect(text).toContain(`Struk : ${order.receiptNo}`);
    expect(text).toContain("Oleh  : Siti");
    expect(text).toContain("Setuju: Bu Rina");
    expect(text).toContain("Batalkan QRIS manual");
  });

  it("records the attempt as a void-slip print job", async () => {
    await voidIt();

    await printVoidSlip(order.id, deps());

    expect(await db.printJobs.toArray()).toMatchObject([{ orderId: order.id, documentType: "void_slip", status: "printed" }]);
  });

  it("does not print a slip for an order that was not voided", async () => {
    expect(await printVoidSlip(order.id, deps())).toBe(false);
    expect(printed).toEqual([]);
  });

  it("never throws when the printer fails", async () => {
    await voidIt();
    isPrinterOn = false;

    expect(await printVoidSlip(order.id, deps())).toBe(false);
    expect(await db.printJobs.toArray()).toMatchObject([{ status: "failed", lastError: "printer offline" }]);
  });
});

describe("printRefundSlip", () => {
  it("prints the refund with its number, the original receipt and the people involved", async () => {
    await db.refunds.put({ ...REFUND, orderId: order.id, receiptNo: order.receiptNo, shiftId: order.shiftId });

    expect(await printRefundSlip(REFUND.id, deps())).toBe(true);

    const text = printed[0]!.join("\n");
    expect(text).toContain("No    : JKT01A-R260925-0001");
    expect(text).toContain(`Struk : ${order.receiptNo}`);
    expect(text).toContain("Setuju: Bu Rina");
    expect(text).toMatch(/Dikembalikan: Tunai\s+28\.875/);
    expect(await db.printJobs.toArray()).toMatchObject([{ orderId: order.id, refundId: REFUND.id, documentType: "refund_slip", status: "printed" }]);
  });

  it("fails without throwing for an unknown refund", async () => {
    expect(await printRefundSlip("01J8Z0000000000000000NOPE1", deps())).toBe(false);
  });
});
