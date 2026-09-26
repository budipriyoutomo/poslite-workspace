import { describe, expect, it } from "vitest";

import { priceCart } from "./price-cart";

const kopi = { productId: "P1", categoryId: "C1", unitPrice: 18_000, modifiers: [], quantity: 3 };
const nasi = { productId: "P2", categoryId: "C2", unitPrice: 25_000, modifiers: [{ price: 5_000 }], quantity: 1 };
const b2g1 = {
  id: "Q1",
  name: "Beli 2 gratis 1",
  type: "buy_x_get_y" as const,
  percentage: null,
  buyQty: 2,
  getQty: 1,
  productIds: ["P1"],
  categoryIds: [],
  daysOfWeek: [],
  startTime: null,
  endTime: null,
  startsOn: null,
  endsOn: null,
};
const at = { date: "2026-09-25", time: "10:00", weekday: 5 };
const noRates = { serviceBps: 0, taxBps: 0 };

describe("priceCart", () => {
  it("prices each line with its promotion and splits item from order discounts", () => {
    const priced = priceCart([kopi, nasi], { type: "percentage", value: 10 }, noRates, [b2g1], at);

    // kopi 54.000 − 18.000 free; nasi 30.000; order 10% of 66.000 = 6.600
    expect(priced.lines).toEqual([
      { discount: { type: "fixed", value: 18_000 }, promotion: { id: "Q1", name: "Beli 2 gratis 1" }, amount: 18_000 },
      { discount: null, promotion: null, amount: 0 },
    ]);
    expect(priced.itemDiscounts).toBe(18_000);
    expect(priced.orderDiscount).toBe(6_600);
    expect(priced.totals).toMatchObject({ subtotal: 84_000, discountAmount: 24_600, total: 59_400 });
  });

  it("uses the cashier's manual discount instead of the promotion", () => {
    const priced = priceCart([{ ...kopi, discount: { type: "percentage", value: 50 } }], null, noRates, [b2g1], at);

    expect(priced.lines[0]).toEqual({ discount: { type: "percentage", value: 50 }, promotion: null, amount: 27_000 });
    expect(priced.totals.total).toBe(27_000);
  });
});
