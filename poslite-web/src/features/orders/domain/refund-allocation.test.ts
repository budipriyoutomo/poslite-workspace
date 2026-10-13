import { describe, expect, it } from "vitest";

import cases from "../../../../tests/fixtures/refund-cases.json";
import { allocateTotal, refundAmount } from "./refund-allocation";

// Same file as poslite-api's RefundAllocator tests (ADR-023): device and server refund the same.
describe("refund allocation (shared fixture)", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    const allocation = allocateTotal(
      c.lines.map((l) => ({ net: l.gross - l.line_discount })),
      c.order_discount,
      c.total,
    );
    expect(allocation).toEqual(c.expected_allocation);
    expect(allocation.reduce((a, b) => a + b, 0)).toBe(c.total);

    const refunded = c.lines.map(() => 0);
    for (const step of c.refunds) {
      const line = c.lines[step.line]!;
      const amount = refundAmount({ allocated: allocation[step.line]!, quantity: line.quantity, alreadyRefunded: refunded[step.line]!, refundQuantity: step.quantity });
      expect(amount).toBe(step.expected_amount);
      refunded[step.line]! += step.quantity;
    }
  });

  it("refuses more units than are left on the line", () => {
    expect(() => refundAmount({ allocated: 100, quantity: 2, alreadyRefunded: 1, refundQuantity: 2 })).toThrow(RangeError);
  });
});
