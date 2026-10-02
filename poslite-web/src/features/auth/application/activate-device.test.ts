import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import { ensureDemoData, readState } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import { activateDevice, loginManager, startDemo } from "./activate-device";

const OUTLET = "01K5ZT00000000000000000001";
const DEVICE = "01K5ZD00000000000000000001";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(status < 400 ? { data, message: "OK", meta: {} } : data), { status });

function server() {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/auth/login")) {
      const { password } = JSON.parse(String(init!.body));
      if (password !== "rahasia-123") return json({ message: "wrong", code: "INVALID_CREDENTIALS" }, 401);
      return json({ token: "bo-token", expires_at: "2026-09-26T15:00:00Z", user: { id: "U", name: "Budi", role: "owner" }, tenant: { id: "T", slug: "maharasa", name: "Warung", status: "active" } });
    }
    if (url.endsWith("/outlets")) return json([{ id: OUTLET, code: "JKT01", name: "Kemang" }]);
    if (url.endsWith("/devices/activate")) {
      if (JSON.parse(String(init!.body)).password !== "rahasia-123") return json({ message: "wrong", code: "INVALID_CREDENTIALS" }, 401);
      return json({ device: { id: DEVICE, code: "B", name: "Kasir 2", outlet: { id: OUTLET, code: "JKT01", name: "Kemang" } }, token: "dev-token", server_time: "2026-09-26T03:00:00Z" }, 201);
    }
    if (url.includes("/sync/pull")) {
      return json({
        changes: [{ entity: "category", op: "upsert", id: "01K5ZC00000000000000000001", version: 1, data: { name: "Minuman", sort_order: 1, print_role: "bar" } }],
        next_cursor: 1,
        has_more: false,
        server_time: "2026-09-26T03:00:00Z",
        media_base_url: "http://api.test/media",
      });
    }
    return json({ message: "?", code: "NOT_FOUND" }, 404);
  });
}

const api = (fetchFn: typeof fetch) => ({ baseUrl: "http://api.test/api/v1", appVersion: "0.1.0", fetch: fetchFn });
const CREDENTIALS = { email: "budi@maharasa.id", password: "rahasia-123" };

describe("loginManager", () => {
  it("returns the outlets a manager can activate a device for", async () => {
    const result = await loginManager(CREDENTIALS, { api: api(server()) });
    expect(result.outlets).toEqual([{ id: OUTLET, code: "JKT01", name: "Kemang" }]);
  });

  it("surfaces wrong credentials", async () => {
    await expect(loginManager({ ...CREDENTIALS, password: "salah" }, { api: api(server()) })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });
});

describe("activateDevice", () => {
  it("stores the device token and pulls the outlet's master data", async () => {
    const db = createTestDb();

    await activateDevice({ ...CREDENTIALS, outletId: OUTLET, deviceName: "Kasir 2" }, { db, api: api(server()) });

    expect(await readState(db, "device")).toEqual({ mode: "server", deviceId: DEVICE, deviceCode: "B", outletId: OUTLET, token: "dev-token" });
    expect((await db.categories.toArray()).map((c) => c.name)).toEqual(["Minuman"]);
  });

  it("wipes demo data so nothing from the demo is ever synced", async () => {
    const db = createTestDb();
    await startDemo({ db });
    await db.outbox.add({ id: "01K5ZE00000000000000000001", type: "shift.opened", aggregateId: "01K5ZS00000000000000000001", occurredAt: "", payload: {}, status: "pending", attempts: 0, createdAt: "" });

    await activateDevice({ ...CREDENTIALS, outletId: OUTLET, deviceName: "Kasir 2" }, { db, api: api(server()) });

    expect(await db.outbox.count()).toBe(0);
    expect(await db.products.count()).toBe(0);
    expect((await db.users.toArray()).map((u) => u.name)).toEqual([]);
  });

  it("does not change the device when the server refuses", async () => {
    const db = createTestDb();
    await startDemo({ db });

    await expect(activateDevice({ ...CREDENTIALS, password: "salah", outletId: OUTLET, deviceName: "x" }, { db, api: api(server()) })).rejects.toBeInstanceOf(ApiError);

    expect(await readState(db, "device")).toEqual({ mode: "demo" });
  });
});

describe("startDemo", () => {
  it("seeds the demo menu and marks the device as demo", async () => {
    const db = createTestDb();
    await startDemo({ db });
    expect(await readState(db, "device")).toEqual({ mode: "demo" });
    expect(await db.products.count()).toBeGreaterThan(0);
    expect(await ensureDemoData(db)).toBe(false);
  });
});
