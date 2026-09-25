import { describe, expect, it } from "vitest";

import { formatRupiah } from "./format";

describe("formatRupiah", () => {
  it.each([
    [0, "Rp 0"],
    [500, "Rp 500"],
    [12_500, "Rp 12.500"],
    [1_234_567, "Rp 1.234.567"],
    [-7_500, "-Rp 7.500"],
  ])("formats %i as %s", (amount, expected) => {
    expect(formatRupiah(amount)).toBe(expected);
  });
});
