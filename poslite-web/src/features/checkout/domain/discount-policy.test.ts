import { describe, expect, it } from "vitest";

import cases from "../../../../tests/fixtures/discount-approval-cases.json";
import { needsApproval } from "./discount-policy";

// Same file as poslite-api's discount policy tests: device and server agree on approval.
describe("needsApproval (06 Order rule 5)", () => {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_, c) => {
    expect(
      needsApproval({
        role: c.role as "cashier" | "manager" | "owner",
        manualPercentages: c.manual_percentages,
        manualAmount: c.manual_amount,
        limits: { maxPercentage: c.limits.max_percentage, maxAmount: c.limits.max_amount },
      }),
    ).toBe(c.expected);
  });
});
