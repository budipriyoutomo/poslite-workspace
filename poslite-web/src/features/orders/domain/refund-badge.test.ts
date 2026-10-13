import { describe, expect, it } from "vitest";

import { refundBadge } from "./refund-badge";

const order = { status: "paid" as const, lines: [{ id: "L1", quantity: 2 }, { id: "L2", quantity: 1 }] };

describe("refundBadge (ADR-023)", () => {
  it("tells void, partial and full refunds apart", () => {
    expect(refundBadge({ ...order, status: "voided" }, [])).toBe("VOID");
    expect(refundBadge(order, [])).toBeNull();
    expect(refundBadge(order, [{ lines: [{ orderLineId: "L1", quantity: 1 }] }])).toBe("PARTIAL");
    expect(refundBadge(order, [{ lines: [{ orderLineId: "L1", quantity: 2 }] }, { lines: [{ orderLineId: "L2", quantity: 1 }] }])).toBe("FULL");
  });
});
