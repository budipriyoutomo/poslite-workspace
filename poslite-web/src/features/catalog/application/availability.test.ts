import { beforeEach, describe, expect, it } from "vitest";

import type { PosDb } from "@/shared/db";

import { IDS, seedOutlet, testDeps } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { markAvailability } from "./availability";

let db: PosDb;
beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db);
  await db.users.put({ id: IDS.cashier, name: "Siti", role: "cashier", pinHash: "", pinSalt: "", pinIterations: 1 });
});

describe("markAvailability (P1-2)", () => {
  it("marks an item sold out until the end of the business day, here at once and for the server", async () => {
    await markAvailability({ productId: IDS.esTeh, isAvailable: false, untilEndOfDay: true, userId: IDS.cashier }, testDeps(db));

    expect(await db.availabilityOverrides.get(IDS.esTeh)).toEqual({ productId: IDS.esTeh, isAvailable: false, until: "2026-09-25T21:00:00.000Z", changedAt: "2026-09-25T03:00:00.000Z" });
    const [event] = await db.outbox.toArray();
    expect(event).toMatchObject({
      type: "product.availability_changed",
      aggregateId: IDS.esTeh,
      payload: { product_id: IDS.esTeh, is_available: false, until: "2026-09-25T21:00:00.000Z", changed_by: IDS.cashier },
    });
  });

  it("can keep it sold out until someone switches it back on", async () => {
    await markAvailability({ productId: IDS.esTeh, isAvailable: false, untilEndOfDay: false, userId: IDS.cashier }, testDeps(db));

    expect((await db.availabilityOverrides.get(IDS.esTeh))?.until).toBeNull();
  });

  it("refuses a waiter", async () => {
    await db.users.put({ id: IDS.cashier, name: "Dewi", role: "waiter", pinHash: "", pinSalt: "", pinIterations: 1 });

    await expect(markAvailability({ productId: IDS.esTeh, isAvailable: false, untilEndOfDay: true, userId: IDS.cashier }, testDeps(db))).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    expect(await db.outbox.count()).toBe(0);
  });
});
