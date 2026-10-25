import { describe, expect, it } from "vitest";

import { describePricing } from "./describe";

describe("describePricing (ADR-029)", () => {
  it("says how the channel prices the menu", () => {
    expect(describePricing({ price_mode: "base", markup_bps: 0, markup_rounding_unit: 100, prices: [] })).toBe("Harga menu");
    expect(describePricing({ price_mode: "markup_bps", markup_bps: 2050, markup_rounding_unit: 500, prices: [] })).toBe("Harga menu +20,5%, dibulatkan ke atas Rp 500");
    expect(describePricing({ price_mode: "price_list", markup_bps: 0, markup_rounding_unit: 100, prices: [{ product_id: "P1", price: 1 }] })).toBe("Daftar harga sendiri · 1 menu");
  });
});
