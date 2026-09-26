import { beforeEach, describe, expect, it } from "vitest";

import type { OpenBillLine, PosDb } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import { cancelBill, saveBill } from "./bills";

let db: PosDb;
beforeEach(() => {
  db = createTestDb();
});

const kopi: OpenBillLine = { key: "k", productId: "P1", name: "Kopi", categoryName: "Minuman", unitPrice: 18_000, modifiers: [], note: "", quantity: 2 };
const bill = (id: string, tableId: string | null = "T1") => ({ id, tableId, tableLabel: "A1", openedBy: "U1", openedAt: "2026-09-25T02:00:00.000Z" });
const NOW = new Date("2026-09-25T03:00:00.000Z");

describe("saveBill", () => {
  it("keeps the order on this device as an open bill", async () => {
    await saveBill({ bill: bill("B1"), lines: [kopi], discount: null }, { db, now: () => NOW });

    expect(await db.openBills.get("B1")).toEqual({ ...bill("B1"), lines: [kopi], discount: null, updatedAt: NOW.toISOString() });
  });

  it("updates the same bill when saved again", async () => {
    await saveBill({ bill: bill("B1"), lines: [kopi], discount: null }, { db, now: () => NOW });
    await saveBill({ bill: bill("B1"), lines: [{ ...kopi, quantity: 3 }], discount: null }, { db, now: () => NOW });

    expect((await db.openBills.get("B1"))?.lines[0]!.quantity).toBe(3);
    expect(await db.openBills.count()).toBe(1);
  });

  it("refuses a second bill on an occupied table", async () => {
    await saveBill({ bill: bill("B1"), lines: [kopi], discount: null }, { db, now: () => NOW });

    await expect(saveBill({ bill: bill("B2"), lines: [kopi], discount: null }, { db, now: () => NOW })).rejects.toMatchObject({ code: "TABLE_OCCUPIED" });
  });

  it("refuses an empty bill", async () => {
    await expect(saveBill({ bill: bill("B1"), lines: [], discount: null }, { db, now: () => NOW })).rejects.toMatchObject({ code: "EMPTY_BILL" });
  });
});

describe("cancelBill", () => {
  it("drops an open bill (nothing was paid yet)", async () => {
    await saveBill({ bill: bill("B1"), lines: [kopi], discount: null }, { db, now: () => NOW });

    await cancelBill("B1", { db, now: () => NOW });

    expect(await db.openBills.count()).toBe(0);
  });
});
