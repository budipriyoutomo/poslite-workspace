import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderRow, OutboxRow, PosDb, RefundRow } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import { pushOutbox } from "./push";

const DEVICE = { mode: "server" as const, deviceId: "01K5ZD00000000000000000001", deviceCode: "A", outletId: "01K5ZT00000000000000000001", token: "tok" };
const NOW = new Date("2026-09-26T03:00:00.000Z");

const event = (n: number, type: OutboxRow["type"] = "shift.opened", aggregateId = `01K5ZS${String(n).padStart(20, "0")}`): OutboxRow => ({
  id: `01K5ZE${String(n).padStart(20, "0")}`,
  type,
  aggregateId,
  occurredAt: "2026-09-26T01:00:00.000Z",
  payload: { n },
  status: "pending",
  attempts: 0,
  createdAt: "2026-09-26T01:00:00.000Z",
});

const results = (list: unknown[]) => new Response(JSON.stringify({ data: { results: list }, message: "OK", meta: {} }), { status: 200 });

let db: PosDb;
beforeEach(async () => {
  db = createTestDb();
  await db.syncState.put({ key: "device", value: DEVICE });
});

const run = (fetchFn: typeof fetch, now = NOW) => pushOutbox({ db, api: { baseUrl: "http://api.test/api/v1", appVersion: "0.1.0", fetch: fetchFn }, now: () => now });

describe("pushOutbox", () => {
  it("sends pending events in order in the contract shape", async () => {
    await db.outbox.bulkAdd([event(1), event(2)]);
    const fetchFn = vi.fn<typeof fetch>(async () => results([{ id: event(1).id, status: "accepted" }, { id: event(2).id, status: "accepted" }]));

    await run(fetchFn);

    const body = JSON.parse(String(fetchFn.mock.calls[0]![1]!.body));
    expect(body.events).toEqual([
      { id: event(1).id, type: "shift.opened", aggregate_id: event(1).aggregateId, occurred_at: "2026-09-26T01:00:00.000Z", payload: { n: 1 } },
      { id: event(2).id, type: "shift.opened", aggregate_id: event(2).aggregateId, occurred_at: "2026-09-26T01:00:00.000Z", payload: { n: 2 } },
    ]);
  });

  it("removes accepted, duplicate and flagged events and marks their orders synced", async () => {
    const orderId = "01K5ZR00000000000000000001";
    await db.orders.add({ id: orderId, syncStatus: "pending", flags: [] } as unknown as OrderRow);
    await db.outbox.bulkAdd([event(1), event(2), event(3, "order.placed", orderId)]);

    await run(async () => results([{ id: event(1).id, status: "accepted" }, { id: event(2).id, status: "duplicate" }, { id: event(3).id, status: "flagged", flags: ["TOTAL_MISMATCH"] }]));

    expect(await db.outbox.count()).toBe(0);
    expect(await db.orders.get(orderId)).toMatchObject({ syncStatus: "synced", flags: ["TOTAL_MISMATCH"] });
  });

  it("marks a refund synced with the server's flags (ADR-023)", async () => {
    const refundId = "01K5ZF00000000000000000001";
    await db.refunds.add({ id: refundId, orderId: "O", shiftId: "S", businessDate: "2026-09-26", createdAt: "x", syncStatus: "pending", flags: [] } as unknown as RefundRow);
    await db.outbox.add(event(1, "order.refunded", refundId));

    await run(async () => results([{ id: event(1).id, status: "flagged", flags: ["REFUND_EXCEEDS_ORDER"] }]));

    expect(await db.refunds.get(refundId)).toMatchObject({ syncStatus: "synced", flags: ["REFUND_EXCEEDS_ORDER"] });
  });

  it("parks a rejected event as dead with the server's reason", async () => {
    await db.outbox.add(event(1));

    await run(async () => results([{ id: event(1).id, status: "rejected", code: "CASHIER_NOT_IN_OUTLET", message: "Cashier does not work here" }]));

    expect(await db.outbox.toArray()).toMatchObject([{ status: "dead", lastError: "CASHIER_NOT_IN_OUTLET: Cashier does not work here" }]);
  });

  it("keeps events for a retry with backoff when the network fails", async () => {
    await db.outbox.add(event(1));

    const outcome = await run(async () => Promise.reject(new TypeError("Failed to fetch")));

    expect(outcome).toEqual({ sent: 0, failed: 1 });
    expect(await db.outbox.toArray()).toMatchObject([{ status: "failed", attempts: 1, nextAttemptAt: "2026-09-26T03:00:02.000Z" }]);
  });

  it("does not resend an event before its backoff has passed", async () => {
    await db.outbox.add({ ...event(1), status: "failed", attempts: 3, nextAttemptAt: "2026-09-26T03:00:30.000Z" });
    const fetchFn = vi.fn(async () => results([]));

    await run(fetchFn);

    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("sends at most 50 events per request", async () => {
    await db.outbox.bulkAdd(Array.from({ length: 60 }, (_, i) => event(i + 1)));
    const fetchFn = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) =>
      results(JSON.parse(String(init!.body)).events.map((e: { id: string }) => ({ id: e.id, status: "accepted" }))),
    );

    await run(fetchFn);

    expect(fetchFn.mock.calls.map(([, init]) => JSON.parse(String(init!.body)).events.length)).toEqual([50, 10]);
    expect(await db.outbox.count()).toBe(0);
  });
});
