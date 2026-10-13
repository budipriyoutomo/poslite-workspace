import { beforeEach, describe, expect, it } from "vitest";

import { placeOrder } from "@/features/checkout";
import { closeShift, openShift } from "@/features/shift";
import type { OrderRow, PosDb } from "@/shared/db";
import { AppError } from "@/shared/errors";

import { IDS, seedOutlet, testDeps } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { localRefundSource, refundOrder, voidOrder } from "./correct-order";

let db: PosDb;
let order: OrderRow;
const MANAGER = { id: IDS.manager, name: "Bu Rina", role: "manager" as const, pinHash: "", pinSalt: "", pinIterations: 1 };

beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db);
  await db.users.put(MANAGER);
  await openShift({ cashierId: IDS.cashier, openingCash: 100_000 }, testDeps(db));
  order = await placeOrder(
    {
      cashier: { id: IDS.cashier, name: "Siti" },
      lines: [{ productId: IDS.gudeg, name: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, quantity: 2, note: "", modifiers: [{ optionId: IDS.ayam, name: "Tambah Ayam", price: 10_000 }] }],
      discount: { type: "percentage", value: 10 },
      payments: [{ paymentMethodId: IDS.cashMethod, amount: 100_000 }],
    },
    testDeps(db),
  );
});

const outboxOf = async (type: string) => (await db.outbox.toArray()).filter((e) => e.type === type);

describe("voidOrder (ADR-023)", () => {
  it("cancels the whole order in its open shift and queues order.voided", async () => {
    await voidOrder({ orderId: order.id, reason: "Salah input", actorId: IDS.cashier, approvedBy: IDS.manager }, testDeps(db));

    expect(await db.orders.get(order.id)).toMatchObject({ status: "voided", voidReason: "Salah input", voidedAt: "2026-09-25T03:00:00.000Z" });
    const [event] = await outboxOf("order.voided");
    expect(event).toMatchObject({ aggregateId: order.id, payload: { reason: "Salah input", voided_by: IDS.cashier, approved_by: IDS.manager } });
  });

  it("needs a manager to approve a cashier's void", async () => {
    const attempt = voidOrder({ orderId: order.id, reason: "Salah input", actorId: IDS.cashier, approvedBy: null }, testDeps(db));

    await expect(attempt).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });

  it("is refused once the shift is closed", async () => {
    await closeShift({ closedBy: IDS.cashier, countedCash: 172_765 }, testDeps(db));
    await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));

    await expect(voidOrder({ orderId: order.id, reason: "Salah input", actorId: IDS.manager, approvedBy: null }, testDeps(db))).rejects.toMatchObject({ code: "SHIFT_CLOSED" });
  });
});

describe("refundOrder (ADR-023)", () => {
  const refundOne = async (approvedBy: string | null = IDS.manager) =>
    refundOrder(
      { source: await localRefundSource(db, order.id), picks: { [order.lines[0]!.id]: 1 }, paymentMethodId: IDS.cashMethod, reason: "Pelanggan komplain", actorId: IDS.cashier, approvedBy },
      testDeps(db),
    );

  it("records a partial refund with its own number and queues a valid order.refunded", async () => {
    const refund = await refundOne();

    expect(refund).toMatchObject({ refundNo: "JKT01A-R260925-0001", total: 36_383, receiptNo: order.receiptNo, syncStatus: "pending" });
    expect(refund.payments).toMatchObject([{ methodType: "cash", methodName: "Tunai", amount: 36_383 }]);
    const [event] = await outboxOf("order.refunded"); // enqueueEvent validated it against the push contract
    expect(event!.payload).toMatchObject({ order_id: order.id, total: 36_383, lines: [{ order_line_id: order.lines[0]!.id, quantity: 1, amount: 36_383 }] });
  });

  it("refunds the rest later with the next number and exactly what is left", async () => {
    await refundOne();
    const second = await refundOne();

    expect((await localRefundSource(db, order.id)).lines[0]!.refunded).toBe(2);
    expect([second.refundNo, second.total]).toEqual(["JKT01A-R260925-0002", 36_382]);
  });

  it("cannot refund more units than are left", async () => {
    await refundOne();
    await refundOne();

    await expect(refundOne()).rejects.toBeInstanceOf(RangeError);
  });

  it("an order with a refund can no longer be voided", async () => {
    await refundOne();

    await expect(voidOrder({ orderId: order.id, reason: "Salah input", actorId: IDS.manager, approvedBy: null }, testDeps(db))).rejects.toMatchObject({ code: "HAS_REFUND" });
  });

  it("closing the shift takes the cash refund out of the expected cash", async () => {
    await refundOne();

    const closed = await closeShift({ closedBy: IDS.cashier, countedCash: 136_382 }, testDeps(db));

    // 100.000 opening + 100.000 paid − 27.235 change − 36.383 refunded
    expect([closed.expectedCash, closed.variance]).toEqual([136_382, 0]);
  });

  it("a voided order's cash is not expected in the drawer", async () => {
    await voidOrder({ orderId: order.id, reason: "Salah input", actorId: IDS.manager, approvedBy: null }, testDeps(db));

    expect((await closeShift({ closedBy: IDS.cashier, countedCash: 100_000 }, testDeps(db))).variance).toBe(0);
  });

  it("needs an open shift: the cash comes from today's drawer", async () => {
    await closeShift({ closedBy: IDS.cashier, countedCash: 172_765 }, testDeps(db));

    await expect(refundOne()).rejects.toBeInstanceOf(AppError);
  });
});
