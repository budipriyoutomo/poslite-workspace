import { describe, expect, it } from "vitest";

import { verifyPin } from "@/features/auth";
import { placeOrder } from "@/features/checkout";
import { closeShift, openShift } from "@/features/shift";
import { ensureDemoData } from "@/shared/db";
import { newId } from "@/shared/id";

import { createTestDb } from "../support/test-db";

describe("demo device: log in, open shift, sell, close shift", () => {
  it("works end to end on the seeded master data", async () => {
    const db = createTestDb();
    await ensureDemoData(db);
    const deps = { db, now: () => new Date("2026-09-25T03:00:00.000Z"), newId };

    const siti = (await db.users.toArray()).find((u) => u.name === "Siti")!;
    const cashier = await verifyPin({ userId: siti.id, pin: "1234" }, deps);
    await openShift({ cashierId: cashier.id, openingCash: 200_000 }, deps);

    const esTeh = (await db.products.toArray()).find((p) => p.name === "Es Teh Manis")!;
    const [sugar] = await db.modifierGroups.bulkGet(esTeh.modifierGroupIds);
    const less = sugar!.options.find((o) => o.name === "Less Sugar")!;
    const cash = await db.paymentMethods.where("type").equals("cash").first();

    const order = await placeOrder(
      {
        cashier,
        lines: [{ productId: esTeh.id, name: esTeh.name, categoryName: "Minuman", unitPrice: esTeh.price, quantity: 2, note: "", modifiers: [{ optionId: less.id, name: less.name, price: less.price }] }],
        discount: null,
        payments: [{ paymentMethodId: cash!.id, amount: 20_000 }],
      },
      deps,
    );
    // 10.000 + service 500 + PB1 1.050 = 11.550 → change 8.450
    expect(order).toMatchObject({ receiptNo: "JKT01A-260925-0001", total: 11_550, changeAmount: 8_450 });

    const closed = await closeShift({ closedBy: cashier.id, countedCash: 211_550 }, deps);
    expect(closed).toMatchObject({ expectedCash: 211_550, variance: 0 });
    expect((await db.outbox.toArray()).map((e) => e.type)).toEqual(["shift.opened", "order.placed", "shift.closed"]);
  });
});
