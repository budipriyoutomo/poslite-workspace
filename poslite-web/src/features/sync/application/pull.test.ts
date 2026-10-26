import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PosDb } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import { pullAll } from "./pull";

const DEVICE = { mode: "server" as const, deviceId: "01K5ZD00000000000000000001", deviceCode: "A", outletId: "01K5ZT00000000000000000001", token: "tok" };
const ULID = (c: string, n: number) => `01K5Z${c}${String(n).padStart(20, "0")}`;
const MEDIA = "https://is3.cloudhost.id/poslite";
const IMAGE_KEY = `${DEVICE.outletId}/products/${ULID("P", 1)}.jpg`;

const page = (changes: unknown[], next_cursor: number, has_more = false) =>
  new Response(JSON.stringify({ data: { changes, next_cursor, has_more, server_time: "2026-09-26T03:00:00Z", media_base_url: MEDIA }, message: "OK", meta: {} }), {
    status: 200,
  });

const MENU = [
  { entity: "outlet_setting", op: "upsert", id: DEVICE.outletId, version: 1, data: { code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta", business_day_cutoff: "04:00", tax_rate_bps: 1000, service_rate_bps: 500, receipt_header: "Warung", receipt_footer: "Makasih" } },
  { entity: "category", op: "upsert", id: ULID("C", 1), version: 2, data: { name: "Minuman", sort_order: 1, print_role: "bar" } },
  { entity: "modifier_group", op: "upsert", id: ULID("G", 1), version: 3, data: { name: "Level Gula", min_select: 1, max_select: 1 } },
  { entity: "modifier_option", op: "upsert", id: ULID("M", 1), version: 4, data: { modifier_group_id: ULID("G", 1), name: "Normal", price: 0, sort_order: 0 } },
  { entity: "modifier_option", op: "upsert", id: ULID("M", 2), version: 5, data: { modifier_group_id: ULID("G", 1), name: "Less", price: 0, sort_order: 1 } },
  { entity: "product", op: "upsert", id: ULID("P", 1), version: 6, data: { category_id: ULID("C", 1), sku: "MN-1", name: "Es Teh", price: 5000, image_key: IMAGE_KEY, is_available: true, modifier_group_ids: [ULID("G", 1)] } },
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

  it("keeps the outlet's brand (ADR-022); a server before brands sends none", async () => {
    const brand = { id: ULID("B", 1), code: "SUSHI", name: "Maharasa Sushi", logo_key: "T/products/logo.png" };
    const [setting, ...rest] = MENU;
    await pullAll(deps(vi.fn(async () => page([{ ...setting!, data: { ...setting!.data, brand } }, ...rest], 9))));
    expect((await db.settings.get("outlet"))?.value.brand).toEqual({ id: brand.id, code: "SUSHI", name: "Maharasa Sushi", logoKey: "T/products/logo.png" });

    await pullAll(deps(vi.fn(async () => page([{ ...setting!, version: 10 }], 10))));
    expect((await db.settings.get("outlet"))?.value.brand).toBeUndefined();
  });

  it("keeps the brand's discount policy (06 Order rule 5)", async () => {
    const policy = { percentages: [5], amounts: [2_000], allow_custom: false, cashier_max_percentage: 5, cashier_max_amount: 2_000 };
    const [setting, ...rest] = MENU;
    await pullAll(deps(vi.fn(async () => page([{ ...setting!, data: { ...setting!.data, discount_policy: policy } }, ...rest], 9))));

    expect((await db.settings.get("outlet"))?.value.discountPolicy).toEqual({ percentages: [5], amounts: [2_000], allowCustom: false, cashierMaxPercentage: 5, cashierMaxAmount: 2_000 });
  });

  it("keeps whether the brand's prices include tax (ADR-030); an older server means they do not", async () => {
    const [setting, ...rest] = MENU;
    await pullAll(deps(vi.fn(async () => page([{ ...setting!, data: { ...setting!.data, price_includes_tax: true } }, ...rest], 9))));
    expect((await db.settings.get("outlet"))?.value.priceIncludesTax).toBe(true);

    const older: Record<string, unknown> = { ...setting!.data };
    delete older.price_includes_tax;
    await pullAll(deps(vi.fn(async () => page([{ ...setting!, data: older, version: 10 }], 10))));
    expect((await db.settings.get("outlet"))?.value.priceIncludesTax).toBe(false);
  });

  it("keeps whether the brand's cashiers close shifts blind (15 · UX-02); an older server means they do", async () => {
    const [setting, ...rest] = MENU;
    await pullAll(deps(vi.fn(async () => page([{ ...setting!, data: { ...setting!.data, blind_close: false } }, ...rest], 9))));
    expect((await db.settings.get("outlet"))?.value.blindClose).toBe(false);

    const older: Record<string, unknown> = { ...setting!.data };
    delete older.blind_close;
    await pullAll(deps(vi.fn(async () => page([{ ...setting!, data: older, version: 10 }], 10))));
    expect((await db.settings.get("outlet"))?.value.blindClose).toBe(true);
  });

  it("keeps the outlet's service mode (ADR-031); an older server means counter", async () => {
    const [setting, ...rest] = MENU;
    await pullAll(deps(vi.fn(async () => page([{ ...setting!, data: { ...setting!.data, service_mode: "table_service" } }, ...rest], 9))));
    expect((await db.settings.get("outlet"))?.value.serviceMode).toBe("table_service");

    await pullAll(deps(vi.fn(async () => page([{ ...setting!, version: 10 }], 10))));
    expect((await db.settings.get("outlet"))?.value.serviceMode).toBe("counter");
  });

  it("keeps when an outlet's sold-out mark ends, and drops this device's mark once the server has it (P1-2)", async () => {
    const product = MENU.find((c) => c.entity === "product")!;
    await db.availabilityOverrides.bulkPut([
      { productId: product.id, isAvailable: false, until: null, changedAt: "2026-09-25T05:00:00.000Z" },
      { productId: ULID("P", 9), isAvailable: false, until: null, changedAt: "2026-09-25T05:00:00.000Z" },
    ]);
    await db.outbox.add({ id: "E1", type: "product.availability_changed", aggregateId: ULID("P", 9), occurredAt: "2026-09-25T05:00:00.000Z", payload: {}, status: "pending", attempts: 0, createdAt: "2026-09-25T05:00:00.000Z" });
    const pendingProduct = { ...product, id: ULID("P", 9) };
    const soldOut = { ...product, data: { ...product.data, is_available: false, unavailable_until: "2026-09-25T21:00:00Z" } };

    await pullAll(deps(vi.fn(async () => page([...MENU.filter((c) => c !== product), soldOut, pendingProduct], 9))));

    expect((await db.products.get(product.id))?.unavailableUntil).toBe("2026-09-25T21:00:00Z");
    expect(await db.availabilityOverrides.toCollection().primaryKeys()).toEqual([ULID("P", 9)]);
  });

  it("keeps the outlet's cash rounding (P1-3); an older server or unit 0 means off", async () => {
    const [setting, ...rest] = MENU;
    await pullAll(deps(vi.fn(async () => page([{ ...setting!, data: { ...setting!.data, cash_rounding_unit: 500, cash_rounding_mode: "down" } }, ...rest], 9))));
    expect((await db.settings.get("outlet"))?.value.cashRounding).toEqual({ unit: 500, mode: "down" });

    await pullAll(deps(vi.fn(async () => page([{ ...setting!, version: 10 }], 10))));
    expect((await db.settings.get("outlet"))?.value.cashRounding).toEqual({ unit: 0, mode: "nearest" });
  });

  it("keeps a waiter (ADR-031)", async () => {
    const waiter = {
      entity: "user",
      op: "upsert",
      id: ULID("A", 7),
      version: 9,
      data: { name: "Dewi", role: "waiter", pin_hash: "aGFzaA==", pin_salt: "c2FsdA==", pin_iterations: 310000 },
    };
    await pullAll(deps(vi.fn(async () => page([...MENU, waiter], 9))));

    expect((await db.users.get(ULID("A", 7)))?.role).toBe("waiter");
  });

  it("keeps sales channels with their prices, and drops one switched off (ADR-029)", async () => {
    const gofood = {
      entity: "sales_channel",
      op: "upsert",
      id: ULID("H", 1),
      version: 9,
      data: {
        code: "GOFOOD",
        name: "GoFood",
        kind: "delivery",
        price_mode: "price_list",
        markup_bps: 0,
        markup_rounding_unit: 100,
        default_payment_method_id: null,
        applies_service: false,
        applies_tax: true,
        requires_external_ref: true,
        sort_order: 3,
        prices: [{ product_id: ULID("P", 1), price: 22_000 }],
      },
    };
    await pullAll(deps(vi.fn(async () => page([...MENU, gofood], 9))));
    expect(await db.salesChannels.get(ULID("H", 1))).toEqual({
      id: ULID("H", 1),
      code: "GOFOOD",
      name: "GoFood",
      kind: "delivery",
      priceMode: "price_list",
      markupBps: 0,
      markupRoundingUnit: 100,
      defaultPaymentMethodId: null,
      appliesService: false,
      appliesTax: true,
      requiresExternalRef: true,
      sortOrder: 3,
      prices: { [ULID("P", 1)]: 22_000 },
    });

    await pullAll(deps(vi.fn(async () => page([{ entity: "sales_channel", op: "delete", id: ULID("H", 1), version: 10 }], 10))));
    expect(await db.salesChannels.count()).toBe(0);
  });

  it("keeps image keys and the server's current media base URL (ADR-021)", async () => {
    await pullAll(deps(vi.fn(async () => page(MENU, 9))));

    expect((await db.products.get(ULID("P", 1)))?.imageKey).toBe(IMAGE_KEY);
    expect((await db.syncState.get("mediaBaseUrl"))?.value).toBe(MEDIA);
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

describe("pullAll — Fase 4 master data", () => {
  const TABLE = { entity: "dining_table", op: "upsert", id: ULID("T", 9), version: 20, data: { label: "A1", area: "Teras", seats: 4, sort_order: 0 } };
  const PROMO = {
    entity: "promotion",
    op: "upsert",
    id: ULID("Q", 1),
    version: 21,
    data: {
      name: "Happy hour",
      type: "percent_off",
      percentage: 20,
      buy_qty: null,
      get_qty: null,
      product_ids: [],
      category_ids: [ULID("C", 1)],
      days_of_week: [1, 2, 3, 4, 5],
      start_time: "14:00",
      end_time: "17:00",
      starts_on: null,
      ends_on: "2026-12-31",
    },
  };

  it("stores dining tables and promotions", async () => {
    await pullAll(deps(vi.fn(async () => page([TABLE, PROMO], 21))));

    expect(await db.diningTables.get(ULID("T", 9))).toEqual({ id: ULID("T", 9), label: "A1", area: "Teras", seats: 4, sortOrder: 0 });
    expect(await db.promotions.get(ULID("Q", 1))).toEqual({
      id: ULID("Q", 1),
      name: "Happy hour",
      type: "percent_off",
      percentage: 20,
      buyQty: null,
      getQty: null,
      productIds: [],
      categoryIds: [ULID("C", 1)],
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: "14:00",
      endTime: "17:00",
      startsOn: null,
      endsOn: "2026-12-31",
    });
  });

  it("drops a promotion or table the server deletes", async () => {
    await pullAll(deps(vi.fn(async () => page([TABLE, PROMO], 21))));

    await pullAll(
      deps(
        vi.fn(async () =>
          page(
            [
              { entity: "promotion", op: "delete", id: ULID("Q", 1), version: 22 },
              { entity: "dining_table", op: "delete", id: ULID("T", 9), version: 23 },
            ],
            23,
          ),
        ),
      ),
    );

    expect(await db.promotions.count()).toBe(0);
    expect(await db.diningTables.count()).toBe(0);
  });
});
