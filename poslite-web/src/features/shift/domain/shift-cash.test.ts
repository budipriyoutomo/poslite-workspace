import { describe, expect, it } from "vitest";

import { closeShiftCash, summarizeShiftCash } from "./shift-cash";

const cashSale = (amount: number, change: number) => ({ status: "paid" as const, payments: [{ methodType: "cash" as const, amount }], changeAmount: change });

describe("summarizeShiftCash", () => {
  it("expected = opening + cash sales - change + cash in - cash out", () => {
    const summary = summarizeShiftCash(
      200_000,
      [cashSale(100_000, 12_500), { status: "paid", payments: [{ methodType: "qris", amount: 49_088 }], changeAmount: 0 }],
      [
        { type: "in", amount: 50_000 },
        { type: "out", amount: 20_000 },
      ],
    );
    expect(summary).toEqual({ openingCash: 200_000, cashSales: 100_000, cashChange: 12_500, cashIn: 50_000, cashOut: 20_000, expectedCash: 317_500 });
  });

  it("counts only the cash part of a split payment", () => {
    const summary = summarizeShiftCash(
      0,
      [{ status: "paid", payments: [{ methodType: "debit", amount: 60_000 }, { methodType: "cash", amount: 50_000 }], changeAmount: 10_000 }],
      [],
    );
    expect(summary.expectedCash).toBe(40_000);
  });

  it("ignores voided orders (their cash was handed back)", () => {
    const summary = summarizeShiftCash(100_000, [{ ...cashSale(50_000, 0), status: "voided" }], []);
    expect(summary.expectedCash).toBe(100_000);
  });
});

describe("closeShiftCash", () => {
  it("records a shortage as a negative variance without blocking", () => {
    expect(closeShiftCash(317_500, 310_000)).toEqual({ expectedCash: 317_500, countedCash: 310_000, variance: -7_500 });
  });

  it("records an overage as a positive variance", () => {
    expect(closeShiftCash(100_000, 101_000).variance).toBe(1_000);
  });

  it("rejects a counted amount that is not integer Rupiah", () => {
    expect(() => closeShiftCash(100_000, 99_999.5)).toThrow(RangeError);
  });
});
