import { beforeEach, describe, expect, it } from "vitest";

import type { KitchenOrder } from "@/features/printing";
import type { OpenBillLine, PosDb } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import { sendBillToKitchen } from "./kitchen";

let db: PosDb;
let tickets: KitchenOrder[];
let failingKeys: string[];

const gudeg: OpenBillLine = { key: "g", productId: "P1", name: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, modifiers: [], note: "", quantity: 2 };
const teh: OpenBillLine = { key: "t", productId: "P2", name: "Es Teh", categoryName: "Minuman", unitPrice: 5_000, modifiers: [], note: "", quantity: 1 };
const BILL = { id: "B1", tableId: "T1", tableLabel: "A1", openedBy: "U1", openedAt: "2026-09-25T02:00:00.000Z", discount: null, updatedAt: "2026-09-25T02:00:00.000Z" };

beforeEach(() => {
  db = createTestDb();
  tickets = [];
  failingKeys = [];
});

const deps = () => ({
  db,
  printKitchen: async (order: KitchenOrder) => {
    tickets.push(order);
    return { sentKeys: order.lines.map((l) => l.key).filter((k) => !failingKeys.includes(k)), hasFailed: failingKeys.length > 0 };
  },
});

describe("sendBillToKitchen", () => {
  it("sends a new bill's items and remembers them as sent", async () => {
    await db.openBills.put({ ...BILL, lines: [gudeg, teh] });

    expect(await sendBillToKitchen({ billId: "B1", cashierName: "Siti" }, deps())).toEqual({ hasFailed: false });

    expect(tickets).toMatchObject([{ refId: "B1", reference: "Bill A1", tableLabel: "A1", cashierName: "Siti", isAddition: false, lines: [{ key: "g", quantity: 2 }, { key: "t", quantity: 1 }] }]);
    expect((await db.openBills.get("B1"))?.lines.map((l) => l.sentQuantity)).toEqual([2, 1]);
  });

  it("sends only what was added after the first ticket, marked as an addition", async () => {
    await db.openBills.put({ ...BILL, lines: [{ ...gudeg, quantity: 3, sentQuantity: 2 }, { ...teh, sentQuantity: 1 }] });

    await sendBillToKitchen({ billId: "B1", cashierName: "Siti" }, deps());

    expect(tickets).toMatchObject([{ isAddition: true, lines: [{ key: "g", quantity: 1 }] }]);
    expect(tickets[0]!.lines).toHaveLength(1);
  });

  it("prints nothing when everything was already sent", async () => {
    await db.openBills.put({ ...BILL, lines: [{ ...gudeg, sentQuantity: 2 }] });

    await sendBillToKitchen({ billId: "B1", cashierName: "Siti" }, deps());

    expect(tickets).toEqual([]);
  });

  it("keeps lines that failed to print unsent, so the next save tries them again", async () => {
    await db.openBills.put({ ...BILL, lines: [gudeg, teh] });
    failingKeys = ["g"];

    expect(await sendBillToKitchen({ billId: "B1", cashierName: "Siti" }, deps())).toEqual({ hasFailed: true });

    expect((await db.openBills.get("B1"))?.lines.map((l) => l.sentQuantity)).toEqual([undefined, 1]);
  });
});
