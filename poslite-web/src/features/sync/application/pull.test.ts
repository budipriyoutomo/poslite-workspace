import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PosDb } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import { pullAll } from "./pull";

const DEVICE = { mode: "server" as const, deviceId: "01K5ZD00000000000000000001", deviceCode: "A", outletId: "01K5ZT00000000000000000001", token: "tok" };
const ULID = (c: string, n: number) => `01K5Z${c}${String(n).padStart(20, "0")}`;

const page = (changes: unknown[], next_cursor: number, has_more = false) =>
  new Response(JSON.stringify({ data: { changes, next_cursor, has_more, server_time: "2026-09-26T03:00:00Z" }, message: "OK", meta: {} }), {
    status: 200,
  });

const MENU = [
  { entity: "outlet_setting", op: "upsert", id: DEVICE.outletId, version: 1, data: { code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta", business_day_cutoff: "04:00", tax_rate_bps: 1000, service_rate_bps: 500, receipt_header: "Warung", receipt_footer: "Makasih" } },
  { entity: "category", op: "upsert", id: ULID("C", 1), version: 2, data: { name: "Minuman", sort_order: 1, print_role: "bar" } },
  { entity: "modifier_group", op: "upsert", id: ULID("G", 1), version: 3, data: { name: "Level Gula", min_select: 1, max_select: 1 } },
  { entity: "modifier_option", op: "upsert", id: ULID("M", 1), version: 4, data: { modifier_group_id: ULID("G", 1), name: "Normal", price: 0, sort_order: 0 } },
  { entity: "modifier_option", op: "upsert", id: ULID("M", 2), version: 5, data: { modifier_group_id: ULID("G", 1), name: "Less", price: 0, sort_order: 1 } },
  { entity: "product", op: "upsert", id: ULID("P", 1), version: 6, data: { category_id: ULID("C", 1), sku: "MN-1", name: "Es Teh", price: 5000, image_url: null, is_available: true, modifier_group_ids: [ULID("G", 1)] } },
  { entity: "payment_method", op: "upsert", id: ULID("Y", 1), version: 7, data: { type: "cash", name: "Tunai", requires_reference: false, sort_order: 1, logo_url: null } },
  { entity: "user", op: "upsert", id: ULID("A", 1), version: 8, data: { name: "Siti", role: "cashier", pin_hash: "aGFzaA==", pin_salt: "c2FsdA==", pin_iterations: 310000 } },
  { entity: "user", op: "upsert", id: ULID("A", 2), version: 9, data: { name: "Tanpa PIN", role: "manager", pin_hash: null, pin_salt: null, pin_iterations: null } },
];

let db: PosDb;
beforeEach(async () => {
  db = createTestDb();
  await db.syncState.put({ key: "device", value: DEVICE });
});

const deps = (fetchFn: typeof fetch) => ({ db, api: { baseUrl: "http://api.test/api/v1", appVersion: "0.1.0", fetch: fetchFn } });

describe("pullAll", () => {
  it("stores the pulled master data and the cursor", async () => {
    await pullAll(deps(vi.fn(async () => page(MENU, 9))));

    expect((await db.settings.get("outlet"))?.value).toMatchObject({ outletCode: "JKT01", deviceCode: "A", deviceId: DEVICE.deviceId, serviceBps: 500, taxBps: 1000, receiptHeader: "Warung" });
    expect(await db.products.get(ULID("P", 1))).toMatchObject({ name: "Es Teh", price: 5000, modifierGroupIds: [ULID("G", 1)] });
    expect((await db.modifierGroups.get(ULID("G", 1)))?.options.map((o) => o.name)).toEqual(["Normal", "Less"]);
    expect(await db.users.get(ULID("A", 1))).toMatchObject({ name: "Siti", pinIterations: 310000 });
    expect(await db.users.get(ULID("A", 2))).toBeUndefined(); // no PIN → cannot log in on a device
    expect((await db.syncState.get("pullCursor"))?.value).toBe(9);
  });

  it("asks for changes after the stored cursor and pages until there is no more", async () => {
    await db.syncState.put({ key: "pullCursor", value: 3 });
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => (String(url).includes("cursor=3") ? page(MENU.slice(3, 5), 5, true) : page(MENU.slice(5, 7), 7)));

    await pullAll(deps(fetchFn));

    expect(fetchFn.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("cursor"))).toEqual(["3", "5"]);
    expect((await db.syncState.get("pullCursor"))?.value).toBe(7);
  });

  it("applies deletes, including an option removed from its group", async () => {
    await pullAll(deps(vi.fn(async () => page(MENU, 9))));

    await pullAll(
      deps(
        vi.fn(async () =>
          page(
            [
              { entity: "modifier_option", op: "delete", id: ULID("M", 2), version: 10 },
              { entity: "payment_method", op: "delete", id: ULID("Y", 1), version: 11 },
            ],
            11,
          ),
        ),
      ),
    );

    expect((await db.modifierGroups.get(ULID("G", 1)))?.options.map((o) => o.name)).toEqual(["Normal"]);
    expect(await db.paymentMethods.count()).toBe(0);
  });

  it("rejects a page that does not match the contract and keeps the old cursor", async () => {
    await db.syncState.put({ key: "pullCursor", value: 2 });
    const bad = [{ entity: "product", op: "upsert", id: ULID("P", 1), version: 3, data: { name: "tanpa harga" } }];

    await expect(pullAll(deps(vi.fn(async () => page(bad, 3))))).rejects.toThrow();

    expect((await db.syncState.get("pullCursor"))?.value).toBe(2);
    expect(await db.products.count()).toBe(0);
  });
});
