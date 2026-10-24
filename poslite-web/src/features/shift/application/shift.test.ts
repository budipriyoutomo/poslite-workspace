import { beforeEach, describe, expect, it } from "vitest";

import { type OpenBillRow, type PosDb, writeState } from "@/shared/db";

import { IDS, seedOutlet, testDeps } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { placeOrder } from "@/features/checkout";

import { closeShift, getOpenShift, openShift, recordCashMovement } from "./shift";

let db: PosDb;
beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db);
});

describe("openShift", () => {
  it("opens a shift for the outlet's business date and queues shift.opened", async () => {
    const shift = await openShift({ cashierId: IDS.cashier, openingCash: 500_000 }, testDeps(db));

    expect(shift).toMatchObject({ status: "open", openingCash: 500_000, openedBy: IDS.cashier, businessDate: "2026-09-25" });
    const [event] = await db.outbox.toArray();
    expect(event).toMatchObject({ type: "shift.opened", aggregateId: shift.id, payload: { opening_cash: 500_000, opened_by: IDS.cashier } });
  });

  it("refuses a second open shift on the same device", async () => {
    await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));
    await expect(openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db))).rejects.toMatchObject({ code: "SHIFT_ALREADY_OPEN" });
    expect(await db.shifts.count()).toBe(1);
  });

  it("refuses when the device has no outlet settings yet", async () => {
    await db.settings.clear();
    await expect(openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db))).rejects.toMatchObject({ code: "DEVICE_NOT_ACTIVATED" });
  });

  it.each([-1, 1000.5])("rejects opening cash %d", async (openingCash) => {
    await expect(openShift({ cashierId: IDS.cashier, openingCash }, testDeps(db))).rejects.toThrow(RangeError);
  });
});

describe("getOpenShift", () => {
  it("returns the open shift, or undefined when none is open", async () => {
    expect(await getOpenShift(db)).toBeUndefined();
    const shift = await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));
    expect((await getOpenShift(db))?.id).toBe(shift.id);
  });
});

describe("recordCashMovement", () => {
  it("records cash in/out on the open shift and queues cash.moved", async () => {
    const shift = await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));
    await recordCashMovement({ type: "out", amount: 20_000, reason: "Beli es batu", createdBy: IDS.cashier }, testDeps(db, "2026-09-25T04:00:00.000Z"));

    expect(await db.cashMovements.toArray()).toMatchObject([{ shiftId: shift.id, type: "out", amount: 20_000 }]);
    expect((await db.outbox.orderBy("seq").last())?.type).toBe("cash.moved");
  });

  it("refuses when no shift is open", async () => {
    await expect(recordCashMovement({ type: "in", amount: 1_000, reason: "x", createdBy: IDS.cashier }, testDeps(db))).rejects.toMatchObject({ code: "NO_OPEN_SHIFT" });
  });
});

describe("closeShift", () => {
  it("closes with expected cash from sales and movements and records the variance", async () => {
    const shift = await openShift({ cashierId: IDS.cashier, openingCash: 200_000 }, testDeps(db));
    await db.orders.add({
      id: "01J8Z000000000000000000R01", shiftId: shift.id, receiptNo: "JKT01A-260925-0001", cashierId: IDS.cashier, cashierName: "Siti",
      businessDate: "2026-09-25", orderType: "take_away", lines: [], discount: null, rates: { serviceBps: 0, taxBps: 0 },
      subtotal: 87_500, discountAmount: 0, serviceCharge: 0, tax: 0, total: 87_500, paidAmount: 100_000, changeAmount: 12_500,
      status: "paid", syncStatus: "pending", flags: [], createdAt: "2026-09-25T03:10:00.000Z",
    });
    await db.payments.add({ id: "01J8Z000000000000000000Y01", orderId: "01J8Z000000000000000000R01", paymentMethodId: IDS.cashMethod, methodType: "cash", methodName: "Tunai", amount: 100_000, reference: null, createdAt: "2026-09-25T03:10:00.000Z" });
    await recordCashMovement({ type: "in", amount: 50_000, reason: "Tambah modal", createdBy: IDS.cashier }, testDeps(db));

    const closed = await closeShift({ closedBy: IDS.cashier, countedCash: 330_000 }, testDeps(db, "2026-09-25T14:00:00.000Z"));

    expect(closed).toMatchObject({ status: "closed", expectedCash: 337_500, countedCash: 330_000, variance: -7_500, closedAt: "2026-09-25T14:00:00.000Z" });
    expect((await db.outbox.orderBy("seq").last())?.payload).toEqual({ closed_by: IDS.cashier, counted_cash: 330_000, expected_cash: 337_500, variance: -7_500 });
    expect(await getOpenShift(db)).toBeUndefined();
  });

  it("refuses when no shift is open", async () => {
    await expect(closeShift({ closedBy: IDS.cashier, countedCash: 0 }, testDeps(db))).rejects.toMatchObject({ code: "NO_OPEN_SHIFT" });
  });
});

describe("closeShift with cash rounding (P1-3)", () => {
  it("expects in the drawer the rounded cash, not the total", async () => {
    const outlet = (await db.settings.get("outlet"))!.value;
    await db.settings.put({ key: "outlet", value: { ...outlet, cashRounding: { unit: 100, mode: "nearest" } } });
    await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));
    // 2 × Es Teh 5.000 + service 5% + PB1 10% = 11.550 → cash 11.600
    await placeOrder({ cashier: { id: IDS.cashier, name: "Siti" }, lines: [{ productId: IDS.esTeh, name: "Es Teh", categoryName: "Minuman", unitPrice: 5_000, quantity: 2, note: "", modifiers: [] }], discount: null, payments: [{ paymentMethodId: IDS.cashMethod, amount: 20_000 }] }, testDeps(db));

    const closed = await closeShift({ closedBy: IDS.cashier, countedCash: 11_600 }, testDeps(db));

    expect([closed.expectedCash, closed.variance]).toEqual([11_600, 0]);
  });
});

describe("closeShift with open bills (ADR-015)", () => {
  it("refuses while a dine-in bill is still open on this device", async () => {
    await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));
    await db.openBills.put({ id: "01J8Z000000000000000000OB1", tableId: null, tableLabel: "A1", lines: [], discount: null, openedBy: IDS.cashier, openedAt: "2026-09-25T03:00:00.000Z", updatedAt: "2026-09-25T03:00:00.000Z" });

    await expect(closeShift({ closedBy: IDS.cashier, countedCash: 0 }, testDeps(db))).rejects.toMatchObject({ code: "OPEN_BILLS" });
    expect((await getOpenShift(db))?.status).toBe("open");
  });
});

describe("closeShift at a table-service outlet (ADR-031 rule 7)", () => {
  const shared = (id: string, extra: Partial<OpenBillRow>): OpenBillRow => ({
    id,
    tableId: null,
    tableLabel: "A1",
    lines: [],
    discount: null,
    openedBy: IDS.cashier,
    openedAt: "2026-09-25T03:00:00.000Z",
    updatedAt: "2026-09-25T03:00:00.000Z",
    origin: "server",
    serverVersion: 1,
    ...extra,
  });
  beforeEach(async () => {
    await writeState(db, "serviceMode", "table_service");
    await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));
  });

  it("closes while the outlet's other bills stay open: they belong to the outlet", async () => {
    await db.openBills.put(
      shared("B1", {
        leaseHolder: {
          deviceName: "Pelayan 1",
          userId: "U2",
          until: "2099-01-01T00:00:00.000Z",
        },
      }),
    );

    await expect(closeShift({ closedBy: IDS.cashier, countedCash: 0 }, testDeps(db))).resolves.toMatchObject({ status: "closed" });
  });

  it("refuses while this device holds a bill's lease", async () => {
    await db.openBills.put(shared("B1", { leaseUntil: "2099-01-01T00:00:00.000Z" }));

    await expect(closeShift({ closedBy: IDS.cashier, countedCash: 0 }, testDeps(db))).rejects.toMatchObject({ code: "OPEN_BILLS" });
  });

  it("refuses while a bill change of this device has not reached the server", async () => {
    await db.openBills.put(shared("B1", { dirty: true }));

    await expect(closeShift({ closedBy: IDS.cashier, countedCash: 0 }, testDeps(db))).rejects.toMatchObject({ code: "OPEN_BILLS" });
  });
});
