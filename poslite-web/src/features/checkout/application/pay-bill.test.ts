import { beforeEach, describe, expect, it } from "vitest";

import { openShift } from "@/features/shift";
import type { OpenBillLine, PosDb } from "@/shared/db";

import { IDS, seedOutlet, testDeps } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { type PayBillInput, payBill } from "./pay-bill";

let db: PosDb;
beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db); // service 5%, PB1 10%
  await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));
});

const line = (key: string, productId: string, name: string, unitPrice: number, quantity: number): OpenBillLine => ({
  key,
  productId,
  name,
  categoryName: "Makanan",
  unitPrice,
  modifiers: [],
  note: "",
  quantity,
});
const gudeg = line("g", IDS.gudeg, "Nasi Gudeg", 20_000, 2);
const esTeh = line("e", IDS.esTeh, "Es Teh", 5_000, 1);
const BILL = { id: "01J8Z000000000000000000OB1", tableId: null, tableLabel: "A1", openedBy: IDS.cashier, openedAt: "2026-09-25T02:00:00.000Z" };

const input = (over: Partial<PayBillInput> = {}): PayBillInput => ({
  bill: BILL,
  cashier: { id: IDS.cashier, name: "Siti" },
  paying: [gudeg, esTeh],
  remaining: [],
  discount: null,
  payments: [{ paymentMethodId: IDS.cashMethod, amount: 100_000 }],
  ...over,
});

describe("payBill", () => {
  beforeEach(async () => {
    await db.openBills.put({ ...BILL, lines: [gudeg, esTeh], discount: null, updatedAt: BILL.openedAt });
  });

  it("pays the whole bill as a dine-in order for its table and closes the bill", async () => {
    const order = await payBill(input(), testDeps(db));

    expect(order).toMatchObject({ orderType: "dine_in", tableLabel: "A1", subtotal: 45_000 });
    expect(await db.openBills.count()).toBe(0);
  });

  it("pays part of the bill and keeps the rest open", async () => {
    const order = await payBill(input({ paying: [{ ...gudeg, quantity: 1 }], remaining: [{ ...gudeg, quantity: 1 }, esTeh] }), testDeps(db));

    expect(order.subtotal).toBe(20_000);
    expect((await db.openBills.get(BILL.id))?.lines.map((l) => [l.name, l.quantity])).toEqual([
      ["Nasi Gudeg", 1],
      ["Es Teh", 1],
    ]);
  });

  it("applies the promotions the cashier chose for the bill", async () => {
    const promo = { id: "01J8Z000000000000000000PQ1", name: "Gudeg hemat", type: "percent_off" as const, percentage: 10, buyQty: null, getQty: null, productIds: [IDS.gudeg], categoryIds: [], daysOfWeek: [], startTime: null, endTime: null, startsOn: null, endsOn: null };
    await db.promotions.put(promo);

    const order = await payBill(input({ promotionIds: [promo.id] }), testDeps(db));

    expect(order.lines.find((l) => l.productId === IDS.gudeg)).toMatchObject({ promotion: { id: promo.id, name: "Gudeg hemat" } });
    expect(order.discountAmount).toBe(4_000);
  });

  it("changes nothing when the payment fails", async () => {
    await expect(payBill(input({ payments: [{ paymentMethodId: IDS.cashMethod, amount: 1_000 }] }), testDeps(db))).rejects.toMatchObject({ code: "INSUFFICIENT" });

    expect(await db.orders.count()).toBe(0);
    expect((await db.openBills.get(BILL.id))?.lines).toHaveLength(2);
  });

  it("keeps the rest as an open bill even if it was never saved before", async () => {
    await db.openBills.clear();

    await payBill(input({ paying: [esTeh], remaining: [gudeg] }), testDeps(db));

    expect(await db.openBills.get(BILL.id)).toMatchObject({ tableLabel: "A1", openedAt: BILL.openedAt, lines: [gudeg] });
  });
});

describe("payBill with items the kitchen already had (ADR-028)", () => {
  beforeEach(async () => {
    await db.openBills.put({ ...BILL, lines: [{ ...gudeg, sentQuantity: 2 }, esTeh], discount: null, updatedAt: BILL.openedAt });
  });

  it("refuses to pay a bill that silently drops a sent unit, leaving no order", async () => {
    const attempt = payBill(input({ paying: [{ ...gudeg, quantity: 1, sentQuantity: 1 }, esTeh] }), testDeps(db));

    await expect(attempt).rejects.toMatchObject({ code: "VOID_APPROVAL_REQUIRED" });
    expect(await db.orders.count()).toBe(0);
  });

  it("pays a split bill whose sent units are all on the paid or remaining part", async () => {
    await payBill(input({ paying: [{ ...gudeg, quantity: 1, sentQuantity: 1 }], remaining: [{ ...gudeg, quantity: 1, sentQuantity: 1 }, esTeh] }), testDeps(db));

    expect(await db.orders.count()).toBe(1);
  });
});
