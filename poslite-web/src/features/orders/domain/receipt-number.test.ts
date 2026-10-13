import { describe, expect, it } from "vitest";

import { formatReceiptNo, formatRefundNo, nextReceiptCounter } from "./receipt-number";

describe("formatReceiptNo", () => {
  it("formats {OUTLET}{DEVICE}-{YYMMDD}-{SEQ}", () => {
    expect(formatReceiptNo({ outletCode: "JKT01", deviceCode: "A", businessDate: "2026-09-25", seq: 42 })).toBe("JKT01A-260925-0042");
  });

  it("keeps growing past 9999 instead of wrapping", () => {
    expect(formatReceiptNo({ outletCode: "JKT01", deviceCode: "B", businessDate: "2026-01-02", seq: 10_000 })).toBe("JKT01B-260102-10000");
  });
});

describe("nextReceiptCounter", () => {
  it("starts at 1 on a device's first sale", () => {
    expect(nextReceiptCounter(undefined, "2026-09-25")).toEqual({ businessDate: "2026-09-25", seq: 1 });
  });

  it("increments within the same business date", () => {
    expect(nextReceiptCounter({ businessDate: "2026-09-25", seq: 41 }, "2026-09-25")).toEqual({ businessDate: "2026-09-25", seq: 42 });
  });

  it("resets to 1 on a new business date", () => {
    expect(nextReceiptCounter({ businessDate: "2026-09-25", seq: 199 }, "2026-09-26")).toEqual({ businessDate: "2026-09-26", seq: 1 });
  });
});

describe("formatRefundNo (ADR-023)", () => {
  it("has its own R-series per device and business day", () => {
    expect(formatRefundNo({ outletCode: "BDG01", deviceCode: "A", businessDate: "2026-10-07", seq: 3 })).toBe("BDG01A-R261007-0003");
  });
});
