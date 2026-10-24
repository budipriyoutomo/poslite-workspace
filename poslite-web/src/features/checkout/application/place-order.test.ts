import { beforeEach, describe, expect, it } from "vitest";

import { openShift } from "@/features/shift";
import type { PosDb, SalesChannelRow } from "@/shared/db";

import { IDS, OUTLET, seedOutlet, testDeps } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { type PlaceOrderInput, placeOrder } from "./place-order";

let db: PosDb;
beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db); // service 5%, PB1 10%, JKT01 / device A, Asia/Jakarta
  await openShift({ cashierId: IDS.cashier, openingCash: 0 }, testDeps(db));
});

const gudegWithAyam = {
  productId: IDS.gudeg,
  name: "Nasi Gudeg",
  categoryName: "Makanan",
  unitPrice: 25_000,
  quantity: 2,
  note: "tidak pedas",
  modifiers: [{ optionId: IDS.ayam, name: "Tambah Ayam", price: 10_000 }],
};

const order = (overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  cashier: { id: IDS.cashier, name: "Siti" },
  lines: [gudegWithAyam],
  discount: { type: "percentage", value: 10 },
  payments: [{ paymentMethodId: IDS.cashMethod, amount: 100_000 }],
  ...overrides,
});

const nonShiftEvents = async () => (await db.outbox.toArray()).filter((e) => e.type !== "shift.opened");

describe("placeOrder", () => {
  it("stores a paid order with totals from the outlet's rate snapshot and the change", async () => {
    // subtotal 70.000 − 10% = 63.000; service 3.150; PB1 6.615 → 72.765; paid 100.000 → change 27.235
    const placed = await placeOrder(order(), testDeps(db));

    expect(placed).toMatchObject({
      status: "paid",
      syncStatus: "pending",
      receiptNo: "JKT01A-260925-0001",
      businessDate: "2026-09-25",
      rates: { serviceBps: 500, taxBps: 1_000 },
      subtotal: 70_000,
      discountAmount: 7_000,
      serviceCharge: 3_150,
      tax: 6_615,
      total: 72_765,
      paidAmount: 100_000,
      changeAmount: 27_235,
    });
    expect(await db.orders.get(placed.id)).toEqual(placed);
  });

  it("charges the menu price when the brand's prices include tax, and says so in order.placed (ADR-030)", async () => {
    await seedOutlet(db, { ...OUTLET, priceIncludesTax: true });

    const placed = await placeOrder(order(), testDeps(db));

    expect(placed).toMatchObject({ rates: { serviceBps: 500, taxBps: 1_000, includesTax: true }, serviceCharge: 2_727, tax: 5_727, total: 63_000, changeAmount: 37_000 });
    const event = (await nonShiftEvents())[0]!;
    expect((event.payload as { rates: unknown }).rates).toEqual({ service_bps: 500, tax_bps: 1_000, includes_tax: true });
  });

  it("snapshots product and modifier names and prices on the lines", async () => {
    const placed = await placeOrder(order(), testDeps(db));
    expect(placed.lines).toMatchObject([
      { productId: IDS.gudeg, productName: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, quantity: 2, notes: "tidak pedas", modifiers: [{ modifierOptionId: IDS.ayam, name: "Tambah Ayam", price: 10_000 }] },
    ]);
  });

  it("stores payments with the method's type and name", async () => {
    const placed = await placeOrder(order(), testDeps(db));
    expect(await db.payments.where("orderId").equals(placed.id).toArray()).toMatchObject([
      { paymentMethodId: IDS.cashMethod, methodType: "cash", methodName: "Tunai", amount: 100_000, reference: null },
    ]);
  });

  it("queues order.placed with the contract payload in the same transaction", async () => {
    const placed = await placeOrder(order(), testDeps(db));
    const [event] = await nonShiftEvents();
    expect(event).toMatchObject({ type: "order.placed", aggregateId: placed.id, status: "pending" });
    expect(event!.payload).toMatchObject({
      receipt_no: "JKT01A-260925-0001",
      cashier_id: IDS.cashier,
      order_type: "take_away",
      discount: { type: "percentage", value: 10 },
      rates: { service_bps: 500, tax_bps: 1_000 },
      totals: { subtotal: 70_000, discount_amount: 7_000, service_charge: 3_150, tax: 6_615, total: 72_765 },
      payments: [{ payment_method_id: IDS.cashMethod, method_type: "cash", amount: 100_000, reference: null }],
      change_amount: 27_235,
    });
  });

  it("numbers receipts sequentially within a business date", async () => {
    await placeOrder(order(), testDeps(db));
    const second = await placeOrder(order(), testDeps(db, "2026-09-25T05:00:00.000Z"));
    expect(second.receiptNo).toBe("JKT01A-260925-0002");
  });

  it("restarts the receipt sequence on a new business date", async () => {
    await placeOrder(order(), testDeps(db));
    // 2026-09-26 10:00 WIB
    const next = await placeOrder(order(), testDeps(db, "2026-09-26T03:00:00.000Z"));
    expect(next.receiptNo).toBe("JKT01A-260926-0001");
  });

  it("refuses an underpaid order and writes nothing", async () => {
    await expect(placeOrder(order({ payments: [{ paymentMethodId: IDS.cashMethod, amount: 50_000 }] }), testDeps(db))).rejects.toMatchObject({ code: "INSUFFICIENT" });
    expect(await db.orders.count()).toBe(0);
    expect(await nonShiftEvents()).toEqual([]);
  });

  it("refuses an empty cart", async () => {
    await expect(placeOrder(order({ lines: [] }), testDeps(db))).rejects.toMatchObject({ code: "EMPTY_CART" });
  });

  it("refuses an unknown payment method", async () => {
    await expect(placeOrder(order({ payments: [{ paymentMethodId: "01J8Z000000000000000000PM9", amount: 100_000 }] }), testDeps(db))).rejects.toMatchObject({ code: "UNKNOWN_PAYMENT_METHOD" });
  });

  it("refuses to sell without an open shift", async () => {
    await db.shifts.clear();
    await expect(placeOrder(order(), testDeps(db))).rejects.toMatchObject({ code: "NO_OPEN_SHIFT" });
  });

  it("rolls back the order and the receipt counter when the event is invalid", async () => {
    await expect(placeOrder(order({ lines: [{ ...gudegWithAyam, productId: "not-a-ulid" }] }), testDeps(db))).rejects.toThrow();
    expect(await db.orders.count()).toBe(0);
    expect(await db.syncState.get("receiptCounter")).toBeUndefined();
  });
});

describe("placeOrder — line discounts, promotions and dine-in (Fase 4)", () => {
  const PROMO = {
    id: "01J8Z000000000000000000PQ1",
    name: "Pagi hemat",
    type: "percent_off" as const,
    percentage: 20,
    buyQty: null,
    getQty: null,
    productIds: [IDS.gudeg],
    categoryIds: [],
    daysOfWeek: [5], // the test clock is Friday 10:00 in Jakarta
    startTime: "09:00",
    endTime: "11:00",
    startsOn: null,
    endsOn: null,
  };
  const plain = { ...gudegWithAyam, modifiers: [], quantity: 1 }; // 25.000

  it("applies a running promotion the cashier chose at payment and sends its snapshot", async () => {
    await db.promotions.put(PROMO);

    const placed = await placeOrder(
      order({ lines: [plain], discount: null, promotionIds: [PROMO.id], payments: [{ paymentMethodId: IDS.cashMethod, amount: 30_000 }] }),
      testDeps(db),
    );

    // 25.000 − 20% = 20.000; service 1.000; PB1 2.100 → 23.100
    expect(placed).toMatchObject({ subtotal: 25_000, discountAmount: 5_000, total: 23_100 });
    expect(placed.lines[0]).toMatchObject({ discount: { type: "percentage", value: 20 }, promotion: { id: PROMO.id, name: "Pagi hemat" } });
    const [event] = await nonShiftEvents();
    expect((event!.payload as { lines: unknown[] }).lines[0]).toMatchObject({ discount: { type: "percentage", value: 20 }, promotion: { id: PROMO.id, name: "Pagi hemat" } });
  });

  it("does not apply a running promotion the cashier did not choose", async () => {
    await db.promotions.put(PROMO);

    const placed = await placeOrder(order({ lines: [plain], discount: null, payments: [{ paymentMethodId: IDS.cashMethod, amount: 30_000 }] }), testDeps(db));

    expect(placed.discountAmount).toBe(0);
    expect(placed.lines[0]).toMatchObject({ discount: null, promotion: null });
  });

  it("does not apply a chosen promotion outside its hours", async () => {
    await db.promotions.put({ ...PROMO, startTime: "14:00", endTime: "17:00" });

    const placed = await placeOrder(
      order({ lines: [plain], discount: null, promotionIds: [PROMO.id], payments: [{ paymentMethodId: IDS.cashMethod, amount: 30_000 }] }),
      testDeps(db),
    );

    expect(placed.discountAmount).toBe(0);
    expect(placed.lines[0]).toMatchObject({ discount: null, promotion: null });
  });

  it("keeps the cashier's manual line discount instead of the promotion", async () => {
    await db.promotions.put(PROMO);

    const placed = await placeOrder(
      order({ lines: [{ ...plain, discount: { type: "fixed", value: 1_000 } }], discount: null, promotionIds: [PROMO.id], payments: [{ paymentMethodId: IDS.cashMethod, amount: 30_000 }] }),
      testDeps(db),
    );

    expect(placed.discountAmount).toBe(1_000);
    expect(placed.lines[0]).toMatchObject({ discount: { type: "fixed", value: 1_000 }, promotion: null });
  });

  it("records a dine-in order with its table", async () => {
    const placed = await placeOrder(order({ orderType: "dine_in", tableLabel: "A1" }), testDeps(db));

    expect(placed).toMatchObject({ orderType: "dine_in", tableLabel: "A1" });
    const [event] = await nonShiftEvents();
    expect(event!.payload).toMatchObject({ order_type: "dine_in", table_label: "A1" });
  });
});

describe("placeOrder discount approval (06 Order rule 5)", () => {
  const MANAGER = { id: IDS.manager, name: "Bu Rina", role: "manager" as const, pinHash: "", pinSalt: "", pinIterations: 1 };
  const strict = async () => {
    const outlet = (await db.settings.get("outlet"))!.value;
    await db.settings.put({ key: "outlet", value: { ...outlet, discountPolicy: { percentages: [5, 10], amounts: [5_000], allowCustom: false, cashierMaxPercentage: 10, cashierMaxAmount: 20_000 } } });
    await db.users.put(MANAGER);
  };

  it("refuses a cashier's discount over the brand limit without a manager", async () => {
    await strict();

    await expect(placeOrder(order({ discount: { type: "percentage", value: 15 } }), testDeps(db))).rejects.toMatchObject({ code: "DISCOUNT_APPROVAL_REQUIRED" });
  });

  it("records the manager who approved it in order.placed", async () => {
    await strict();

    await placeOrder(order({ discount: { type: "percentage", value: 15 }, discountApprovedBy: IDS.manager }), testDeps(db));

    const [event] = await nonShiftEvents();
    expect(event!.payload).toMatchObject({ discount_approved_by: IDS.manager });
  });

  it("lets a manager give it alone", async () => {
    await strict();

    const placed = await placeOrder(order({ cashier: { id: IDS.manager, name: "Bu Rina" }, discount: { type: "percentage", value: 15 } }), testDeps(db));

    expect(placed.status).toBe("paid");
  });

  it("never takes a waiter as the approver (ADR-031)", async () => {
    await strict();
    await db.users.put({ ...MANAGER, role: "waiter" });

    await expect(placeOrder(order({ discount: { type: "percentage", value: 15 }, discountApprovedBy: IDS.manager }), testDeps(db))).rejects.toMatchObject({ code: "DISCOUNT_APPROVAL_REQUIRED" });
  });

  it("keeps the old 20% limit on an outlet synced before brands had a policy", async () => {
    await expect(placeOrder(order({ discount: { type: "percentage", value: 25 } }), testDeps(db))).rejects.toMatchObject({ code: "DISCOUNT_APPROVAL_REQUIRED" });
  });
});

describe("placeOrder on a sales channel (ADR-029)", () => {
  const channel = (over: Partial<SalesChannelRow>): SalesChannelRow => ({
    id: "01J8Z000000000000000000CH1",
    code: "TAKE_AWAY",
    name: "Take Away",
    kind: "take_away",
    priceMode: "base",
    markupBps: 0,
    markupRoundingUnit: 100,
    defaultPaymentMethodId: null,
    appliesService: true,
    appliesTax: true,
    requiresExternalRef: false,
    sortOrder: 2,
    prices: {},
    ...over,
  });
  const GOFOOD = channel({ id: "01J8Z000000000000000000CH3", code: "GOFOOD", name: "GoFood", kind: "delivery", appliesService: false, requiresExternalRef: true, sortOrder: 3 });

  beforeEach(async () => {
    await db.salesChannels.bulkPut([channel({}), GOFOOD]);
  });

  it("charges only what the channel charges and sends its channel and the app's order number", async () => {
    // 63.000 after 10% off; no service on GoFood; PB1 6.300 → 69.300
    const placed = await placeOrder(order({ channelId: GOFOOD.id, externalRef: "GF-881234" }), testDeps(db));

    expect(placed).toMatchObject({ orderType: "take_away", rates: { serviceBps: 0, taxBps: 1_000 }, serviceCharge: 0, total: 69_300, channelId: GOFOOD.id, channelName: "GoFood", externalRef: "GF-881234" });
    const payload = (await nonShiftEvents())[0]!.payload as Record<string, unknown>;
    expect([payload.channel_id, payload.external_ref]).toEqual([GOFOOD.id, "GF-881234"]);
  });

  it("puts a sale without a chosen channel on the brand's channel of its kind", async () => {
    const placed = await placeOrder(order(), testDeps(db));

    expect([placed.channelId, placed.total]).toEqual(["01J8Z000000000000000000CH1", 72_765]);
  });

  it("needs the delivery app's order number when the channel asks for it, and writes nothing", async () => {
    await expect(placeOrder(order({ channelId: GOFOOD.id }), testDeps(db))).rejects.toMatchObject({ code: "EXTERNAL_REF_REQUIRED" });
    expect(await db.orders.count()).toBe(0);
  });
});

describe("placeOrder without sales channels on the device (before ADR-029)", () => {
  it("sends no channel, as before", async () => {
    await placeOrder(order(), testDeps(db));

    expect((await nonShiftEvents())[0]!.payload).not.toHaveProperty("channel_id");
  });
});
