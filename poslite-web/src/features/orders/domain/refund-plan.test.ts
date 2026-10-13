import { describe, expect, it } from "vitest";

import { planRefund, type RefundSource } from "./refund-plan";

// The order of the shared refund fixture: 2 × Nasi Gudeg + Tambah Ayam, 10% off, service 5%, PB1 10%.
const ORDER: RefundSource = {
  orderId: "O1",
  receiptNo: "JKT01A-260925-0001",
  total: 72_765,
  discountAmount: 7_000,
  lines: [{ id: "L1", productName: "Nasi Gudeg", quantity: 2, gross: 70_000, lineDiscount: 0, refunded: 0 }],
};

describe("planRefund (ADR-023)", () => {
  it("prices the chosen units with the shared allocation", () => {
    expect(planRefund(ORDER, { L1: 1 })).toEqual({ lines: [{ orderLineId: "L1", productName: "Nasi Gudeg", quantity: 1, amount: 36_383 }], total: 36_383 });
  });

  it("the last unit gets exactly what is left of the line", () => {
    const after = { ...ORDER, lines: [{ ...ORDER.lines[0]!, refunded: 1 }] };
    expect(planRefund(after, { L1: 1 }).total).toBe(36_382);
  });

  it("ignores lines left at zero and refuses more than is left", () => {
    expect(planRefund(ORDER, { L1: 0 })).toEqual({ lines: [], total: 0 });
    expect(() => planRefund(ORDER, { L1: 3 })).toThrow(RangeError);
  });
});
