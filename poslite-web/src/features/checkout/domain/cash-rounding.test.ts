import { describe, expect, it } from "vitest";

import cases from "../../../../tests/fixtures/cash-rounding-cases.json";
import { cashRounding, type CashRoundingMode } from "./cash-rounding";
import { settle } from "./payment";

// Same fixture as poslite-api (P1-3): only the cash part is rounded; the total and tax never change.
describe("cashRounding (shared fixture)", () => {
  it.each(cases)("$name", (c) => {
    const result = cashRounding(c.total, c.non_cash_paid, { unit: c.unit, mode: c.mode as CashRoundingMode });

    expect({ cash_due: result.cashDue, cash_charged: result.cashCharged, rounding: result.rounding }).toEqual(c.expected);
  });
});

describe("settle with cash rounding (P1-3)", () => {
  const rule = { unit: 100, mode: "nearest" } as const;

  it("asks for the rounded cash and gives change from it", () => {
    expect(settle(72_765, [{ methodType: "cash", amount: 100_000 }], rule)).toEqual({ ok: true, paidAmount: 100_000, changeAmount: 27_200, rounding: 35 });
  });

  it("accepts less than the total when the cash part rounds down", () => {
    expect(settle(72_749, [{ methodType: "cash", amount: 72_700 }], rule)).toEqual({ ok: true, paidAmount: 72_700, changeAmount: 0, rounding: -49 });
  });

  it("still asks for the rounded remainder", () => {
    expect(settle(72_765, [{ methodType: "cash", amount: 72_765 }], rule)).toEqual({ ok: false, reason: "INSUFFICIENT", remaining: 35 });
  });

  it("does not round a sale paid without cash", () => {
    expect(settle(72_765, [{ methodType: "qris", amount: 72_765 }], rule)).toEqual({ ok: true, paidAmount: 72_765, changeAmount: 0, rounding: 0 });
  });
});
