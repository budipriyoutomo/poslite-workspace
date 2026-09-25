import { describe, expect, it } from "vitest";

import { pressCashKey } from "./cash-keypad";

describe("pressCashKey", () => {
  it("appends digits", () => {
    expect(pressCashKey(pressCashKey(0, "5"), "0")).toBe(50);
  });

  it("appends 00 and 000 as shortcuts", () => {
    expect(pressCashKey(pressCashKey(5, "00"), "000")).toBe(500_000);
  });

  it("removes the last digit on backspace", () => {
    expect(pressCashKey(12_345, "backspace")).toBe(1_234);
  });

  it("clears to zero", () => {
    expect(pressCashKey(12_345, "clear")).toBe(0);
  });

  it("ignores input that would exceed the 1 billion Rupiah cap", () => {
    expect(pressCashKey(100_000_000, "000")).toBe(100_000_000);
  });

  it("keeps zero when adding zeros to an empty amount", () => {
    expect(pressCashKey(0, "000")).toBe(0);
  });
});
