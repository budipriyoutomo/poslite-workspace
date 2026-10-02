import { describe, expect, it, vi } from "vitest";

import { readState } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import { resendDead, runSync } from "./sync-engine";

const DEVICE = { mode: "server" as const, deviceId: "01K5ZD00000000000000000001", deviceCode: "A", outletId: "01K5ZT00000000000000000001", token: "tok" };
const NOW = new Date("2026-09-26T03:00:00.000Z");
const body = (data: unknown) => new Response(JSON.stringify({ data, message: "OK", meta: {} }), { status: 200 });

function server() {
  return vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).includes("/sync/push")) {
      const { events } = JSON.parse(String(init!.body));
      return body({ results: events.map((e: { id: string }) => ({ id: e.id, status: "accepted" })) });
    }
    return body({ changes: [], next_cursor: 0, has_more: false, server_time: NOW.toISOString(), media_base_url: "http://api.test/media" });
  });
}

const event = { id: "01K5ZE00000000000000000001", type: "shift.opened" as const, aggregateId: "01K5ZS00000000000000000001", occurredAt: "", payload: {}, status: "pending" as const, attempts: 0, createdAt: "" };

describe("runSync", () => {
  it("pushes the outbox first, then pulls, and records the sync time", async () => {
    const db = createTestDb();
    await db.syncState.put({ key: "device", value: DEVICE });
    await db.outbox.add(event);
    const fetchFn = server();

    await runSync({ db, api: { baseUrl: "http://api.test/api/v1", appVersion: "0.1.0", fetch: fetchFn }, now: () => NOW });

    expect(fetchFn.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(["/api/v1/sync/push", "/api/v1/sync/pull"]);
    expect(await db.outbox.count()).toBe(0);
    expect(await readState(db, "lastSyncAt")).toBe(NOW.toISOString());
  });

  it("does nothing on a demo device", async () => {
    const db = createTestDb();
    await db.syncState.put({ key: "device", value: { mode: "demo" } });
    const fetchFn = server();

    await runSync({ db, api: { baseUrl: "http://api.test/api/v1", appVersion: "0.1.0", fetch: fetchFn }, now: () => NOW });

    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("resendDead", () => {
  it("puts dead events back in the queue", async () => {
    const db = createTestDb();
    await db.outbox.add({ ...event, status: "dead", attempts: 1, lastError: "CASHIER_NOT_IN_OUTLET" });

    await resendDead(db);

    expect(await db.outbox.toArray()).toMatchObject([{ status: "pending", attempts: 0 }]);
    expect((await db.outbox.toArray())[0]!.lastError).toBeUndefined();
  });
});
