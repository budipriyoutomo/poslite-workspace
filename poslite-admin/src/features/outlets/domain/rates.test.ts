import { describe, expect, it } from "vitest";

import { bpsToPercent, percentToBps } from "./rates";

describe("percentToBps", () => {
  it.each([
    ["10", 1000],
    ["0", 0],
    ["5,5", 550],
    ["12.25", 1225],
    ["100", 10_000],
  ])("parses %s%% without floats", (input, bps) => {
    expect(percentToBps(input)).toBe(bps);
  });

  it.each(["", "abc", "1.234", "100.01", "-1", "1,2,3"])("rejects %j", (input) => {
    expect(percentToBps(input)).toBeNull();
  });
});

describe("bpsToPercent", () => {
  it.each([
    [1000, "10"],
    [550, "5,5"],
    [1225, "12,25"],
    [5, "0,05"],
    [0, "0"],
  ])("formats %i bps as %s", (bps, text) => {
    expect(bpsToPercent(bps)).toBe(text);
  });
});
