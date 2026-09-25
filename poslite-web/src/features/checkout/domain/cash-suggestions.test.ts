import { describe, expect, it } from "vitest";

import { suggestCashAmounts } from "./cash-suggestions";

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
