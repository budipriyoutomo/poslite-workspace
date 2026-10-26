import { beforeEach, describe, expect, it } from "vitest";

import type { OpenBillLine, PosDb } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import { cancelBill, markBillPrinted, moveBill, saveBill } from "./bills";

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

    expect(await db.openBills.get("B1")).toEqual({
      ...bill("B1"),
      lines: [kopi],
      discount: null,
      updatedAt: NOW.toISOString(),
      origin: "local",
    });
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

    await cancelBill({ billId: "B1" }, { db, now: () => NOW });

    expect(await db.openBills.count()).toBe(0);
  });
});

describe("moveBill (doc 11 §2)", () => {
  const save = (id: string, tableId: string, tableLabel: string) => saveBill({ bill: { ...bill(id, tableId), tableLabel }, lines: [kopi], discount: null }, { db, now: () => NOW });
  const deps = () => ({ db, now: () => new Date("2026-09-25T04:00:00.000Z") });

  it("moves an open bill to a free table, keeping its lines", async () => {
    await save("B1", "T1", "A1");

    await moveBill({ billId: "B1", table: { id: "T2", label: "B2" } }, deps());

    expect(await db.openBills.get("B1")).toMatchObject({ tableId: "T2", tableLabel: "B2", lines: [kopi], updatedAt: "2026-09-25T04:00:00.000Z" });
  });

  it("refuses a table that has another open bill on this device", async () => {
    await save("B1", "T1", "A1");
    await save("B2", "T2", "B2");

    await expect(moveBill({ billId: "B1", table: { id: "T2", label: "B2" } }, deps())).rejects.toMatchObject({ code: "TABLE_OCCUPIED" });
  });

  it("refuses the table it is already on", async () => {
    await save("B1", "T1", "A1");

    await expect(moveBill({ billId: "B1", table: { id: "T1", label: "A1" } }, deps())).rejects.toMatchObject({ code: "SAME_TABLE" });
  });
});

describe("guests and the printed bill (15 · UX-04)", () => {
  const PRINTED = new Date("2026-09-25T03:30:00.000Z");

  it("keeps the number of guests the bill was opened with", async () => {
    await saveBill({ bill: { ...bill("B1"), guestCount: 4 }, lines: [kopi], discount: null }, { db, now: () => NOW });
    await saveBill({ bill: bill("B1"), lines: [{ ...kopi, quantity: 3 }], discount: null }, { db, now: () => NOW });

    expect((await db.openBills.get("B1"))?.guestCount).toBe(4);
  });

  it("marks when the bill was printed for the guests", async () => {
    await saveBill({ bill: bill("B1"), lines: [kopi], discount: null }, { db, now: () => NOW });

    await markBillPrinted("B1", { db, now: () => PRINTED });

    expect((await db.openBills.get("B1"))?.printedAt).toBe(PRINTED.toISOString());
  });

  it("forgets the printed bill once the order changes: the guests hold an old one", async () => {
    await saveBill({ bill: bill("B1"), lines: [kopi], discount: null }, { db, now: () => NOW });
    await markBillPrinted("B1", { db, now: () => PRINTED });

    await saveBill({ bill: bill("B1"), lines: [{ ...kopi, quantity: 3 }], discount: null }, { db, now: () => NOW });

    expect((await db.openBills.get("B1"))?.printedAt).toBeNull();
  });

  it("keeps the printed bill when saved unchanged", async () => {
    await saveBill({ bill: bill("B1"), lines: [kopi], discount: null }, { db, now: () => NOW });
    await markBillPrinted("B1", { db, now: () => PRINTED });

    await saveBill({ bill: bill("B1"), lines: [kopi], discount: null }, { db, now: () => NOW });

    expect((await db.openBills.get("B1"))?.printedAt).toBe(PRINTED.toISOString());
  });

  it("sends a shared bill's print to the server", async () => {
    await saveBill({ bill: bill("B1"), lines: [kopi], discount: null }, { db, now: () => NOW });
    await db.openBills.update("B1", { origin: "server", dirty: false });

    await markBillPrinted("B1", { db, now: () => PRINTED, shared: true });

    expect((await db.openBills.get("B1"))?.dirty).toBe(true);
  });
});
