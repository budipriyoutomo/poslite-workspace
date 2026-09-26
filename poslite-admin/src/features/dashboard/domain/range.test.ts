import { describe, expect, it } from "vitest";

import { dateRange, daysBetween } from "./range";

// 2026-09-26 10:00 WIB
const NOW = new Date("2026-09-26T03:00:00Z");

describe("dateRange", () => {
  it("today is the outlet's business date", () => {
    expect(dateRange("today", NOW, "Asia/Jakarta")).toEqual({ from: "2026-09-26", to: "2026-09-26" });
  });

  it("before the 04:00 cutoff, today is still yesterday's business day", () => {
    // 2026-09-27 02:00 WIB
    expect(dateRange("today", new Date("2026-09-26T19:00:00Z"), "Asia/Jakarta")).toEqual({ from: "2026-09-26", to: "2026-09-26" });
  });

  it("the last 7 days include today", () => {
    expect(dateRange("7d", NOW, "Asia/Jakarta")).toEqual({ from: "2026-09-20", to: "2026-09-26" });
  });

  it("the last 30 days cross a month", () => {
    expect(dateRange("30d", NOW, "Asia/Jakarta")).toEqual({ from: "2026-08-28", to: "2026-09-26" });
  });
});

describe("daysBetween", () => {
  it("lists every day of the range, so empty days show as zero", () => {
    expect(daysBetween("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });
});
