import { describe, expect, it } from "vitest";

import { redirectFor } from "./pos-shell";

describe("redirectFor (POS route guard)", () => {
  it("sends a cashier without an open shift to the shift screen before selling", () => {
    expect(redirectFor({ role: "cashier", pathname: "/sell", hasShift: false })).toBe("/shift");
    expect(redirectFor({ role: "cashier", pathname: "/orders", hasShift: false })).toBeNull();
  });

  it("lets a waiter take orders without a shift (ADR-031)", () => {
    expect(redirectFor({ role: "waiter", pathname: "/sell", hasShift: false })).toBeNull();
  });

  it("keeps a waiter away from payment and the cash drawer", () => {
    expect(redirectFor({ role: "waiter", pathname: "/checkout", hasShift: true })).toBe("/tables");
    expect(redirectFor({ role: "waiter", pathname: "/shift", hasShift: false })).toBe("/tables");
  });
});
