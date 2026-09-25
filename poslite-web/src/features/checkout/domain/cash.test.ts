import { describe, expect, it } from "vitest";

import { pressCashKey, suggestCashAmounts } from "./cash";

describe("suggestCashAmounts", () => {
  it("offers the exact amount first, then the next round notes above it", () => {
    expect(suggestCashAmounts(87_500)).toEqual([87_500, 90_000, 100_000, 150_000]);
  });

  it("does not repeat the exact amount when it is already round", () => {
    expect(suggestCashAmounts(50_000)).toEqual([50_000, 60_000, 100_000, 150_000]);
  });

  it("suggests small notes for a small bill", () => {
    expect(suggestCashAmounts(12_300)).toEqual([12_300, 15_000, 20_000, 50_000]);
  });

  it("returns at most four amounts", () => {
    expect(suggestCashAmounts(1_234_567).length).toBeLessThanOrEqual(4);
  });

  it("suggests nothing for a zero bill", () => {
    expect(suggestCashAmounts(0)).toEqual([0]);
  });
});

describe("pressCashKey", () => {
  it("appends digits", () => {
    expect(pressCashKey(pressCashKey(0, "5"), "0")).toBe(50);
  });

  it("appends 00 and 000 as shortcuts", () => {
    expect(pressCashKey(pressCashKey(5, "00"), "000")).toBe(500_000);
  });

  it("removes the last digit on backspace", () => {
    expect(pressCashKey(12_345, "backspace")).toBe(1_234);
  });

  it("clears to zero", () => {
    expect(pressCashKey(12_345, "clear")).toBe(0);
  });

  it("ignores input that would exceed the 1 billion Rupiah cap", () => {
    expect(pressCashKey(100_000_000, "000")).toBe(100_000_000);
  });

  it("keeps zero when adding zeros to an empty amount", () => {
    expect(pressCashKey(0, "000")).toBe(0);
  });
});
