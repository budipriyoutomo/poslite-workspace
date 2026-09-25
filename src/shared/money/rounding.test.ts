import { describe, expect, it } from "vitest";

import { divRoundHalfUp } from "./rounding";

describe("divRoundHalfUp", () => {
  it.each([
    [5, 10, 1], // exactly .5
    [15, 10, 2],
    [70_875_000, 10_000, 7_088], // PB1 10% of 70.875 = 7.087,5 (04-printing receipt)
  ])("rounds exact half up: %i / %i = %i", (n, d, expected) => {
    expect(divRoundHalfUp(n, d)).toBe(expected);
  });

  it.each([
    [4, 10, 0],
    [14, 10, 1],
    [33_750_000, 10_000, 3_375], // service 5% of 67.500 — no remainder
    [0, 10_000, 0],
  ])("rounds below half down and keeps exact quotients: %i / %i = %i", (n, d, expected) => {
    expect(divRoundHalfUp(n, d)).toBe(expected);
  });

  it.each([
    [-5, 10],
    [5, 0],
    [5, -10],
    [0.5, 10],
    [5, 2.5],
  ])("rejects %d / %d (needs integers, n >= 0, d > 0)", (n, d) => {
    expect(() => divRoundHalfUp(n, d)).toThrow(RangeError);
  });
});
