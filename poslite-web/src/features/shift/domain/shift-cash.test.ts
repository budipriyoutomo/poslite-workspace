import { describe, expect, it } from "vitest";

import { closeShiftCash, COINS, countedTotal, NOTES, summarizeShiftCash } from "./shift-cash";

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
    expect(summary).toEqual({ openingCash: 200_000, cashSales: 100_000, cashChange: 12_500, cashIn: 50_000, cashOut: 20_000, cashRefunds: 0, expectedCash: 317_500 });
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

describe("summarizeShiftCash with refunds (ADR-023)", () => {
  it("takes cash refunds out of the drawer; non-cash refunds are paid back outside it", () => {
    const summary = summarizeShiftCash(
      100_000,
      [cashSale(50_000, 0)],
      [],
      [{ payments: [{ methodType: "cash", amount: 12_000 }] }, { payments: [{ methodType: "qris", amount: 30_000 }] }],
    );
    expect(summary).toMatchObject({ cashRefunds: 12_000, expectedCash: 138_000 });
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

describe("countedTotal (15 · UX-02)", () => {
  it("adds note value x pieces", () => {
    expect(countedTotal({ 100_000: 2, 20_000: 3, 1_000: 4 })).toBe(264_000);
  });

  it("adds the coins' total kept under 1", () => {
    expect(countedTotal({ 50_000: 1, [COINS]: 2_500 })).toBe(52_500);
  });

  it("is zero for an empty count", () => {
    expect(countedTotal({})).toBe(0);
  });

  it("refuses negative or fractional pieces", () => {
    expect(() => countedTotal({ 10_000: -1 })).toThrow(RangeError);
    expect(() => countedTotal({ 10_000: 1.5 })).toThrow(RangeError);
  });
});

describe("NOTES", () => {
  it("lists the Rupiah notes from the largest down to 1.000", () => {
    expect(NOTES).toEqual([100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000]);
  });
});
