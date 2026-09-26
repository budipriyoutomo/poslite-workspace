import { describe, expect, it } from "vitest";

import { compactRupiah, niceTicks } from "./scale";

describe("niceTicks", () => {
  it.each([
    [72_765, [0, 20_000, 40_000, 60_000, 80_000]],
    [1_000_000, [0, 250_000, 500_000, 750_000, 1_000_000]],
    [3_400_000, [0, 1_000_000, 2_000_000, 3_000_000, 4_000_000]],
    [0, [0, 1]],
  ])("covers %i with round steps", (max, ticks) => {
    expect(niceTicks(max)).toEqual(ticks);
  });
});

describe("compactRupiah", () => {
  it.each([
    [0, "Rp 0"],
    [950, "Rp 950"],
    [72_765, "Rp 72,8 rb"],
    [1_250_000, "Rp 1,3 jt"],
    [2_000_000_000, "Rp 2 M"],
  ])("%i → %s", (value, text) => {
    expect(compactRupiah(value)).toBe(text);
  });
});
