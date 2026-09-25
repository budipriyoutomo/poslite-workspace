import { afterEach, describe, expect, it } from "vitest";

import { createTestDb } from "../../../../tests/support/test-db";
import { enqueueEvent } from "./enqueue-event";

const db = createTestDb();
afterEach(() => db.outbox.clear());

const shiftOpened = {
  id: "01J8Z0000000000000000000E1",
  type: "shift.opened" as const,
  aggregateId: "01J8Z0000000000000000000S1",
  occurredAt: "2026-09-25T01:00:00.000Z",
  payload: { opening_cash: 500_000, opened_by: "01J8Z0000000000000000000A1" },
};

describe("enqueueEvent", () => {
  it("stores a valid event as pending with zero attempts", async () => {
    await enqueueEvent(db, shiftOpened);
    const [row] = await db.outbox.toArray();
    expect(row).toMatchObject({ ...shiftOpened, status: "pending", attempts: 0 });
    expect(row!.seq).toBeTypeOf("number");
  });

  it("keeps events in send order", async () => {
    await enqueueEvent(db, shiftOpened);
    await enqueueEvent(db, { ...shiftOpened, id: "01J8Z0000000000000000000E2" });
    expect((await db.outbox.orderBy("seq").toArray()).map((r) => r.id)).toEqual([shiftOpened.id, "01J8Z0000000000000000000E2"]);
  });

  it("rejects a payload that breaks the contract and writes nothing", async () => {
    await expect(enqueueEvent(db, { ...shiftOpened, payload: { opening_cash: 500_000.5, opened_by: "U1" } })).rejects.toThrow();
    expect(await db.outbox.count()).toBe(0);
  });
});
