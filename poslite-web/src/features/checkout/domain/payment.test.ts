import { describe, expect, it } from "vitest";

import { remainingDue, settle } from "./payment";

describe("settle", () => {
  it("returns change for a cash overpayment", () => {
    expect(settle(87_500, [{ methodType: "cash", amount: 100_000 }])).toEqual({ ok: true, paidAmount: 100_000, changeAmount: 12_500, rounding: 0 });
  });

  it("accepts exact cash with no change", () => {
    expect(settle(25_000, [{ methodType: "cash", amount: 25_000 }])).toEqual({ ok: true, paidAmount: 25_000, changeAmount: 0, rounding: 0 });
  });

  it("accepts an exact non-cash payment", () => {
    expect(settle(49_088, [{ methodType: "qris", amount: 49_088 }])).toEqual({ ok: true, paidAmount: 49_088, changeAmount: 0, rounding: 0 });
  });

  it("gives change only from cash in a split payment", () => {
    // 100.000 bill: 60.000 debit, cash 50.000 → change 10.000
    const result = settle(100_000, [
      { methodType: "debit", amount: 60_000 },
      { methodType: "cash", amount: 50_000 },
    ]);
    expect(result).toEqual({ ok: true, paidAmount: 110_000, changeAmount: 10_000, rounding: 0 });
  });

  it("rejects an order with no payment", () => {
    expect(settle(10_000, [])).toEqual({ ok: false, reason: "NO_PAYMENT" });
  });

  it("rejects an underpayment and reports what is still due", () => {
    expect(settle(87_500, [{ methodType: "cash", amount: 50_000 }])).toEqual({ ok: false, reason: "INSUFFICIENT", remaining: 37_500 });
  });

  it("rejects non-cash above the bill (no change on non-cash)", () => {
    expect(settle(87_500, [{ methodType: "debit", amount: 90_000 }])).toEqual({ ok: false, reason: "NON_CASH_EXCEEDS_TOTAL" });
  });

  it("accepts a zero total with one zero payment (100% discount)", () => {
    expect(settle(0, [{ methodType: "cash", amount: 0 }])).toEqual({ ok: true, paidAmount: 0, changeAmount: 0, rounding: 0 });
  });

  it.each([-1, 10.5])("rejects a payment amount of %d (integer Rupiah >= 0)", (amount) => {
    expect(() => settle(10_000, [{ methodType: "cash", amount }])).toThrow(RangeError);
  });
});

describe("remainingDue", () => {
  it("is the unpaid part of the bill", () => {
    expect(remainingDue(100_000, [{ methodType: "debit", amount: 60_000 }])).toBe(40_000);
  });

  it("never goes below zero", () => {
    expect(remainingDue(100_000, [{ methodType: "cash", amount: 150_000 }])).toBe(0);
  });
});
