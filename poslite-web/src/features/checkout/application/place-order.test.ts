import { beforeEach, describe, expect, it } from "vitest";

import { openShift } from "@/features/shift";
import type { PosDb } from "@/shared/db";

import { IDS, seedOutlet, testDeps } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { type PlaceOrderInput, placeOrder } from "./place-order";

let db: PosDb;
beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db); // service 5%, PB1 10%, JKT01 / device A, Asia/Jakarta
  await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));
});

const gudegWithAyam = {
  productId: IDS.gudeg,
  name: "Nasi Gudeg",
  categoryName: "Makanan",
  unitPrice: 25_000,
  quantity: 2,
  note: "tidak pedas",
  modifiers: [{ optionId: IDS.ayam, name: "Tambah Ayam", price: 10_000 }],
};

const order = (overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  cashier: { id: IDS.cashier, name: "Siti" },
  lines: [gudegWithAyam],
  discount: { type: "percentage", value: 10 },
  payments: [{ paymentMethodId: IDS.cashMethod, amount: 100_000 }],
  ...overrides,
});

const nonShiftEvents = async () => (await db.outbox.toArray()).filter((e) => e.type !== "shift.opened");

describe("placeOrder", () => {
  it("stores a paid order with totals from the outlet's rate snapshot and the change", async () => {
    // subtotal 70.000 − 10% = 63.000; service 3.150; PB1 6.615 → 72.765; paid 100.000 → change 27.235
    const placed = await placeOrder(order(), testDeps(db));

    expect(placed).toMatchObject({
      status: "paid",
      syncStatus: "pending",
      receiptNo: "JKT01A-260925-0001",
      businessDate: "2026-09-25",
      rates: { serviceBps: 500, taxBps: 1_000 },
      subtotal: 70_000,
      discountAmount: 7_000,
      serviceCharge: 3_150,
      tax: 6_615,
      total: 72_765,
      paidAmount: 100_000,
      changeAmount: 27_235,
    });
    expect(await db.orders.get(placed.id)).toEqual(placed);
  });

  it("snapshots product and modifier names and prices on the lines", async () => {
    const placed = await placeOrder(order(), testDeps(db));
    expect(placed.lines).toMatchObject([
      { productId: IDS.gudeg, productName: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, quantity: 2, notes: "tidak pedas", modifiers: [{ modifierOptionId: IDS.ayam, name: "Tambah Ayam", price: 10_000 }] },
    ]);
  });

  it("stores payments with the method's type and name", async () => {
    const placed = await placeOrder(order(), testDeps(db));
    expect(await db.payments.where("orderId").equals(placed.id).toArray()).toMatchObject([
      { paymentMethodId: IDS.cashMethod, methodType: "cash", methodName: "Tunai", amount: 100_000, reference: null },
    ]);
  });

  it("queues order.placed with the contract payload in the same transaction", async () => {
    const placed = await placeOrder(order(), testDeps(db));
    const [event] = await nonShiftEvents();
    expect(event).toMatchObject({ type: "order.placed", aggregateId: placed.id, status: "pending" });
    expect(event!.payload).toMatchObject({
      receipt_no: "JKT01A-260925-0001",
      cashier_id: IDS.cashier,
      order_type: "take_away",
      discount: { type: "percentage", value: 10 },
      rates: { service_bps: 500, tax_bps: 1_000 },
      totals: { subtotal: 70_000, discount_amount: 7_000, service_charge: 3_150, tax: 6_615, total: 72_765 },
      payments: [{ payment_method_id: IDS.cashMethod, method_type: "cash", amount: 100_000, reference: null }],
      change_amount: 27_235,
    });
  });

  it("numbers receipts sequentially within a business date", async () => {
    await placeOrder(order(), testDeps(db));
    const second = await placeOrder(order(), testDeps(db, "2026-09-25T05:00:00.000Z"));
    expect(second.receiptNo).toBe("JKT01A-260925-0002");
  });

  it("restarts the receipt sequence on a new business date", async () => {
    await placeOrder(order(), testDeps(db));
    // 2026-09-26 10:00 WIB
    const next = await placeOrder(order(), testDeps(db, "2026-09-26T03:00:00.000Z"));
    expect(next.receiptNo).toBe("JKT01A-260926-0001");
  });

  it("refuses an underpaid order and writes nothing", async () => {
    await expect(placeOrder(order({ payments: [{ paymentMethodId: IDS.cashMethod, amount: 50_000 }] }), testDeps(db))).rejects.toMatchObject({ code: "INSUFFICIENT" });
    expect(await db.orders.count()).toBe(0);
    expect(await nonShiftEvents()).toEqual([]);
  });

  it("refuses an empty cart", async () => {
    await expect(placeOrder(order({ lines: [] }), testDeps(db))).rejects.toMatchObject({ code: "EMPTY_CART" });
  });

  it("refuses an unknown payment method", async () => {
    await expect(placeOrder(order({ payments: [{ paymentMethodId: "01J8Z000000000000000000PM9", amount: 100_000 }] }), testDeps(db))).rejects.toMatchObject({ code: "UNKNOWN_PAYMENT_METHOD" });
  });

  it("refuses to sell without an open shift", async () => {
    await db.shifts.clear();
    await expect(placeOrder(order(), testDeps(db))).rejects.toMatchObject({ code: "NO_OPEN_SHIFT" });
  });

  it("rolls back the order and the receipt counter when the event is invalid", async () => {
    await expect(placeOrder(order({ lines: [{ ...gudegWithAyam, productId: "not-a-ulid" }] }), testDeps(db))).rejects.toThrow();
    expect(await db.orders.count()).toBe(0);
    expect(await db.syncState.get("receiptCounter")).toBeUndefined();
  });
});
