import { describe, expect, it } from "vitest";

import { applyPromotions, availablePromotions, isScheduled, localMoment, type Promotion, type PromoLine } from "./promotion-engine";

const DRINKS = "01K5ZC00000000000000000001";
const FOOD = "01K5ZC00000000000000000002";
const KOPI = "01K5ZP00000000000000000001";
const NASI = "01K5ZP00000000000000000002";

const promo = (over: Partial<Promotion>): Promotion => ({
  id: "01K5ZQ00000000000000000001",
  name: "Promo",
  type: "percent_off",
  percentage: 10,
  buyQty: null,
  getQty: null,
  productIds: [],
  categoryIds: [],
  daysOfWeek: [],
  startTime: null,
  endTime: null,
  startsOn: null,
  endsOn: null,
  ...over,
});
const line = (over: Partial<PromoLine> = {}): PromoLine => ({ productId: KOPI, categoryId: DRINKS, unitPrice: 18000, modifiersTotal: 0, quantity: 1, manualDiscount: null, ...over });
// Friday 2026-09-25, 15:00 in the outlet
const FRI_15 = { date: "2026-09-25", time: "15:00", weekday: 5 };

describe("applyPromotions", () => {
  it("leaves lines alone when no promotion applies", () => {
    expect(applyPromotions([line()], [], FRI_15)).toEqual([{ discount: null, promotion: null }]);
  });

  it("gives percent off to lines in the promotion's category", () => {
    const happy = promo({ name: "Happy hour", percentage: 20, categoryIds: [DRINKS] });

    expect(applyPromotions([line(), line({ productId: NASI, categoryId: FOOD })], [happy], FRI_15)).toEqual([
      { discount: { type: "percentage", value: 20 }, promotion: { id: happy.id, name: "Happy hour" } },
      { discount: null, promotion: null },
    ]);
  });

  it("applies percent off without a scope to every line", () => {
    const all = promo({ percentage: 5 });

    expect(applyPromotions([line({ productId: NASI, categoryId: FOOD })], [all], FRI_15)[0]!.discount).toEqual({ type: "percentage", value: 5 });
  });

  it("matches a product id even outside the promotion's categories", () => {
    const kopi = promo({ productIds: [KOPI], categoryIds: [FOOD] });

    expect(applyPromotions([line()], [kopi], FRI_15)[0]!.promotion?.id).toBe(kopi.id);
  });

  it("buy 2 get 1 frees one unit per three, modifiers included", () => {
    const b2g1 = promo({ type: "buy_x_get_y", percentage: null, buyQty: 2, getQty: 1, productIds: [KOPI], name: "Beli 2 gratis 1" });

    const [seven] = applyPromotions([line({ quantity: 7, modifiersTotal: 2000 })], [b2g1], FRI_15);

    expect(seven).toEqual({ discount: { type: "fixed", value: 40000 }, promotion: { id: b2g1.id, name: "Beli 2 gratis 1" } });
  });

  it("buy 2 get 1 gives nothing below three units", () => {
    const b2g1 = promo({ type: "buy_x_get_y", percentage: null, buyQty: 2, getQty: 1, productIds: [KOPI] });

    expect(applyPromotions([line({ quantity: 2 })], [b2g1], FRI_15)[0]).toEqual({ discount: null, promotion: null });
  });

  it("buy x get y never applies without a scope", () => {
    const loose = promo({ type: "buy_x_get_y", percentage: null, buyQty: 1, getQty: 1 });

    expect(applyPromotions([line({ quantity: 4 })], [loose], FRI_15)[0]!.discount).toBeNull();
  });

  it("picks the promotion worth the most for the line", () => {
    const tenPct = promo({ id: "01K5ZQ00000000000000000001", percentage: 10 });
    const b2g1 = promo({ id: "01K5ZQ00000000000000000002", type: "buy_x_get_y", percentage: null, buyQty: 2, getQty: 1, productIds: [KOPI] });

    // 3 × 18.000 = 54.000: 10% = 5.400, one free = 18.000
    expect(applyPromotions([line({ quantity: 3 })], [tenPct, b2g1], FRI_15)[0]!.promotion?.id).toBe(b2g1.id);
  });

  it("breaks a tie with the smaller id", () => {
    const a = promo({ id: "01K5ZQ00000000000000000002", name: "B" });
    const b = promo({ id: "01K5ZQ00000000000000000001", name: "A" });

    expect(applyPromotions([line()], [a, b], FRI_15)[0]!.promotion?.name).toBe("A");
  });

  it("keeps the cashier's manual discount instead of any promotion", () => {
    const manual = { type: "fixed" as const, value: 1000 };

    expect(applyPromotions([line({ manualDiscount: manual })], [promo({ percentage: 50 })], FRI_15)).toEqual([{ discount: manual, promotion: null }]);
  });

  it("ignores promotions outside their schedule", () => {
    const weekend = promo({ daysOfWeek: [6, 7] });

    expect(applyPromotions([line()], [weekend], FRI_15)[0]!.discount).toBeNull();
  });
});

describe("isScheduled", () => {
  it.each([
    ["no restriction", {}, FRI_15, true],
    ["inside the hours", { startTime: "14:00", endTime: "17:00" }, FRI_15, true],
    ["at the start minute", { startTime: "15:00", endTime: "17:00" }, FRI_15, true],
    ["at the end minute (exclusive)", { startTime: "13:00", endTime: "15:00" }, FRI_15, false],
    ["on an allowed day", { daysOfWeek: [5] }, FRI_15, true],
    ["on another day", { daysOfWeek: [1] }, FRI_15, false],
    ["before starts_on", { startsOn: "2026-09-26" }, FRI_15, false],
    ["on ends_on", { endsOn: "2026-09-25" }, FRI_15, true],
    ["after ends_on", { endsOn: "2026-09-24" }, FRI_15, false],
    ["overnight, before midnight", { startTime: "22:00", endTime: "02:00", daysOfWeek: [5] }, { date: "2026-09-25", time: "23:00", weekday: 5 }, true],
    ["overnight, after midnight counts as the day it started", { startTime: "22:00", endTime: "02:00", daysOfWeek: [5] }, { date: "2026-09-26", time: "01:00", weekday: 6 }, true],
    ["overnight, after midnight of a day not allowed", { startTime: "22:00", endTime: "02:00", daysOfWeek: [6] }, { date: "2026-09-26", time: "01:00", weekday: 6 }, false],
    ["overnight, outside the window", { startTime: "22:00", endTime: "02:00" }, FRI_15, false],
  ])("%s", (_, over, at, expected) => {
    expect(isScheduled(promo(over), at)).toBe(expected);
  });
});

describe("localMoment", () => {
  it("reads date, time and ISO weekday in the outlet's time zone", () => {
    // 2026-09-25T17:30Z = Saturday 00:30 in Jakarta (UTC+7)
    expect(localMoment(new Date("2026-09-25T17:30:00Z"), "Asia/Jakarta")).toEqual({ date: "2026-09-26", time: "00:30", weekday: 6 });
  });
});

describe("availablePromotions", () => {
  const happy = promo({ id: "01K5ZQ00000000000000000001", name: "Happy hour", percentage: 20, categoryIds: [DRINKS] });
  const nasi = promo({ id: "01K5ZQ00000000000000000002", name: "Nasi hemat", percentage: 10, productIds: [NASI] });

  it("offers the running promotions that cut the price of some line, biggest saving first", () => {
    const lines = [line(), line({ productId: NASI, categoryId: FOOD, unitPrice: 30000 })];

    expect(availablePromotions(lines, [nasi, happy], FRI_15)).toEqual([
      { promotion: { id: happy.id, name: "Happy hour" }, amount: 3600 },
      { promotion: { id: nasi.id, name: "Nasi hemat" }, amount: 3000 },
    ]);
  });

  it("leaves out promotions outside their schedule or with nothing to discount", () => {
    const later = promo({ ...happy, startTime: "17:00", endTime: "19:00" });

    expect(availablePromotions([line({ productId: NASI, categoryId: FOOD })], [later, happy], FRI_15)).toEqual([]);
  });

  it("does not count lines the cashier discounted by hand", () => {
    const lines = [line({ manualDiscount: { type: "percentage", value: 5 } }), line({ productId: "01K5ZP00000000000000000003" })];

    expect(availablePromotions(lines, [happy], FRI_15)).toEqual([{ promotion: { id: happy.id, name: "Happy hour" }, amount: 3600 }]);
  });
});
