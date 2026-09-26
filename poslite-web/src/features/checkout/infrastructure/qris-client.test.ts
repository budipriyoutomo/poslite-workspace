import { describe, expect, it, vi } from "vitest";

import { createTestDb } from "../../../../tests/support/test-db";
import { qrisClientFor } from "./qris-client";

const DEVICE = { mode: "server" as const, deviceId: "01K5ZD00000000000000000001", deviceCode: "A", outletId: "01K5ZT00000000000000000001", token: "tok" };
const BODY = { id: "01K5ZK00000000000000000001", amount: 41_580, status: "pending", qr_string: "FAKEQRIS|r|41580", expires_at: "2026-09-27T03:15:00Z", paid_at: null };

describe("qrisClientFor", () => {
  it("creates a charge with the device token and reads it back", async () => {
    const db = createTestDb();
    await db.syncState.put({ key: "device", value: DEVICE });
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ data: BODY, message: "OK", meta: {} }), { status: 201 }));

    const client = await qrisClientFor(db, { baseUrl: "http://api.test/api/v1", appVersion: "0.1.0", fetch: fetchFn });
    const charge = await client!.create(BODY.id, 41_580);

    expect(charge).toEqual({ id: BODY.id, amount: 41_580, status: "pending", qrString: "FAKEQRIS|r|41580", expiresAt: BODY.expires_at });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/api/v1/payments/qris");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init.body))).toEqual({ id: BODY.id, amount: 41_580 });
  });

  it("is unavailable in demo mode (no server)", async () => {
    const db = createTestDb();
    await db.syncState.put({ key: "device", value: { mode: "demo" } });

    expect(await qrisClientFor(db, { baseUrl: "http://api.test/api/v1", appVersion: "0.1.0" })).toBeNull();
  });
});
