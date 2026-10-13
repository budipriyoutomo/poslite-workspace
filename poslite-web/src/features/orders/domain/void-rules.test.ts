import { describe, expect, it } from "vitest";

import { checkReason, voidBlocker } from "./void-rules";

const OK = { status: "paid" as const, deviceId: "D1", shiftId: "S1" };
const here = { deviceId: "D1", openShiftId: "S1", refunded: false };

describe("voidBlocker (ADR-023)", () => {
  it("allows a paid order of this device in the shift that is still open", () => {
    expect(voidBlocker(OK, here)).toBeNull();
  });

  it.each([
    ["already voided", { ...OK, status: "voided" as const }, here, "ALREADY_VOIDED"],
    ["another device", { ...OK, deviceId: "D2" }, here, "OTHER_DEVICE"],
    ["shift already closed", { ...OK, shiftId: "S0" }, here, "SHIFT_CLOSED"],
    ["no shift open", OK, { ...here, openShiftId: null }, "SHIFT_CLOSED"],
    ["already refunded", OK, { ...here, refunded: true }, "HAS_REFUND"],
  ])("blocks %s", (_, order, context, code) => {
    expect(voidBlocker(order, context)).toBe(code);
  });
});

describe("checkReason", () => {
  it("takes a listed reason as is", () => {
    expect(checkReason("Salah input", "")).toBe("Salah input");
  });

  it("needs a text for Lainnya, at most 200 characters", () => {
    expect(checkReason("Lainnya", "  Tamu alergi  ")).toBe("Tamu alergi");
    expect(checkReason("Lainnya", " ")).toBeNull();
    expect(checkReason("Lainnya", "x".repeat(201))).toBeNull();
  });
});
