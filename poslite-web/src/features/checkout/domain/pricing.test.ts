import { describe, expect, it } from "vitest";

import cases from "../../../../tests/fixtures/pricing-cases.json";
import { calculate, type Discount } from "./pricing";

// Same fixture as poslite-api (PriceCalculator): frontend and backend must compute identical totals.
describe("calculate (shared pricing fixture)", () => {
  it.each(cases)("$name", ({ lines, discount, rates, expected }) => {
    const result = calculate(
      lines.map((l) => ({
        unitPrice: l.unit_price,
        modifiersTotal: l.modifiers_total,
        quantity: l.quantity,
        discount: "discount" in l ? (l.discount as Discount) : null,
      })),
      discount as Discount | null,
      { serviceBps: rates.service_bps, taxBps: rates.tax_bps, includesTax: "includes_tax" in rates && rates.includes_tax === true },
    );

    expect(result).toEqual({
      subtotal: expected.subtotal,
      discountAmount: expected.discount_amount,
      serviceCharge: expected.service_charge,
      tax: expected.tax,
      total: expected.total,
    });
  });
});

describe("calculate (input guards)", () => {
  const rates = { serviceBps: 0, taxBps: 0 };

  it.each([101, -1, 12.5])("rejects percentage discount %d (integer 0..100)", (value) => {
    expect(() => calculate([{ unitPrice: 1000, modifiersTotal: 0, quantity: 1 }], { type: "percentage", value }, rates)).toThrow(RangeError);
  });

  it.each([-1, 0.5])("rejects fixed discount %d (integer Rupiah >= 0)", (value) => {
    expect(() => calculate([{ unitPrice: 1000, modifiersTotal: 0, quantity: 1 }], { type: "fixed", value }, rates)).toThrow(RangeError);
  });

  it.each([0, -1, 1.5])("rejects quantity %d (positive integer)", (quantity) => {
    expect(() => calculate([{ unitPrice: 1000, modifiersTotal: 0, quantity }], null, rates)).toThrow(RangeError);
  });

  it("rejects a non-integer price", () => {
    expect(() => calculate([{ unitPrice: 1000.5, modifiersTotal: 0, quantity: 1 }], null, rates)).toThrow(RangeError);
  });
});
