import { beforeEach, describe, expect, it } from "vitest";

import { openShift } from "@/features/shift";
import type { OpenBillLine, PosDb } from "@/shared/db";

import { IDS, seedOutlet, testDeps } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { cancelBill, saveBill, type VoidApproval } from "./bills";

// ADR-028: what the kitchen already had leaves an open bill only with a manager's approval,
// recorded as bill.item_voided; anything not sent yet goes freely.

let db: PosDb;
const MANAGER = { id: IDS.manager, name: "Bu Rina", role: "manager" as const, pinHash: "", pinSalt: "", pinIterations: 1 };
const bill = { id: "01J8Z000000000000000000B01", tableId: null, tableLabel: "A3", openedBy: IDS.cashier, openedAt: "2026-09-25T02:00:00.000Z" };
const gudeg: OpenBillLine = {
  key: "g",
  productId: IDS.gudeg,
  name: "Nasi Gudeg",
  categoryName: "Makanan",
  unitPrice: 25_000,
  modifiers: [{ optionId: IDS.ayam, groupId: "G1", name: "Tambah Ayam", price: 10_000 }],
  note: "",
  quantity: 3,
  sentQuantity: 2,
};
const approval: VoidApproval = { reason: "Pelanggan batal", actorId: IDS.cashier, approvedBy: IDS.manager };

beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db);
  await db.users.put(MANAGER);
  await openShift({ cashierId: IDS.cashier, openingCash: 100_000 }, testDeps(db));
  await db.openBills.put({ ...bill, lines: [gudeg], discount: null, updatedAt: "2026-09-25T02:30:00.000Z" });
});

const voids = async () => (await db.outbox.toArray()).filter((e) => e.type === "bill.item_voided");
const save = (lines: OpenBillLine[], withApproval: typeof approval | undefined = undefined) =>
  saveBill({ bill, lines, discount: null, ...(withApproval && { void: withApproval }) }, testDeps(db));

describe("saveBill with lines the kitchen already had (ADR-028)", () => {
  it("takes off units not sent yet without any approval or event", async () => {
    await save([{ ...gudeg, quantity: 2 }]);

    expect((await db.openBills.get(bill.id))?.lines[0]?.quantity).toBe(2);
    expect(await voids()).toEqual([]);
  });

  it("refuses to take off a sent unit without approval and leaves the bill as it was", async () => {
    await expect(save([{ ...gudeg, quantity: 1 }])).rejects.toMatchObject({ code: "VOID_APPROVAL_REQUIRED" });

    expect((await db.openBills.get(bill.id))?.lines[0]?.quantity).toBe(3);
  });

  it("queues bill.item_voided for the sent units taken off, with who approved", async () => {
    await save([{ ...gudeg, quantity: 1 }], approval);

    const [event] = await voids();
    expect(event?.payload).toEqual({
      bill_id: bill.id,
      scope: "line",
      table_label: "A3",
      shift_id: expect.any(String),
      cashier_id: IDS.cashier,
      approved_by: IDS.manager,
      reason: "Pelanggan batal",
      lines: [{ product_id: IDS.gudeg, product_name: "Nasi Gudeg", modifiers: ["Tambah Ayam"], unit_price: 35_000, quantity: 1, amount: 35_000 }],
    });
  });

  it("keeps only what is left as sent, so the kitchen is not sent the voided unit again", async () => {
    await save([{ ...gudeg, quantity: 1 }], approval);

    expect((await db.openBills.get(bill.id))?.lines[0]?.sentQuantity).toBe(1);
  });

  it("returns the voided lines for the cancel ticket", async () => {
    const { voided } = await save([{ ...gudeg, quantity: 1 }], approval);

    expect(voided.map((v) => [v.name, v.quantity])).toEqual([["Nasi Gudeg", 1]]);
  });

  it("needs a manager when a cashier approves alone", async () => {
    await expect(save([{ ...gudeg, quantity: 1 }], { ...approval, approvedBy: null })).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });
});

describe("cancelBill (ADR-028)", () => {
  it("drops a bill the kitchen never saw without an event", async () => {
    await db.openBills.put({ ...bill, lines: [{ ...gudeg, sentQuantity: 0 }], discount: null, updatedAt: "2026-09-25T02:30:00.000Z" });

    await cancelBill({ billId: bill.id }, testDeps(db));

    expect([await db.openBills.count(), (await voids()).length]).toEqual([0, 0]);
  });

  it("refuses to drop a bill with sent items without approval", async () => {
    await expect(cancelBill({ billId: bill.id }, testDeps(db))).rejects.toMatchObject({ code: "VOID_APPROVAL_REQUIRED" });

    expect(await db.openBills.count()).toBe(1);
  });

  it("records every sent unit as cancelled with the bill", async () => {
    const { voided } = await cancelBill({ billId: bill.id, void: approval }, testDeps(db));

    const [event] = await voids();
    expect(event?.payload).toMatchObject({ scope: "bill_cancelled", lines: [{ quantity: 2, amount: 70_000 }] });
    expect([await db.openBills.count(), voided.length]).toEqual([0, 1]);
  });
});
