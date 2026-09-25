import { describe, expect, it } from "vitest";

import { businessDate } from "./business-date";

describe("businessDate", () => {
  it("is the outlet's local calendar date during opening hours", () => {
    // 2026-09-25 10:00 WIB
    expect(businessDate(new Date("2026-09-25T03:00:00Z"), "Asia/Jakarta", "04:00")).toBe("2026-09-25");
  });

  it("uses the outlet time zone, not UTC", () => {
    // 2026-09-25 23:30 UTC = 2026-09-26 06:30 WIB
    expect(businessDate(new Date("2026-09-25T23:30:00Z"), "Asia/Jakarta", "04:00")).toBe("2026-09-26");
  });

  it("counts sales before the cutoff as the previous business day", () => {
    // 2026-09-26 02:30 WIB — still the night of the 25th
    expect(businessDate(new Date("2026-09-25T19:30:00Z"), "Asia/Jakarta", "04:00")).toBe("2026-09-25");
  });

  it("starts the new business day exactly at the cutoff", () => {
    // 2026-09-26 04:00 WIB
    expect(businessDate(new Date("2026-09-25T21:00:00Z"), "Asia/Jakarta", "04:00")).toBe("2026-09-26");
  });

  it("crosses month and year boundaries", () => {
    // 2027-01-01 01:00 WIT (UTC+9) → 2026-12-31
    expect(businessDate(new Date("2026-12-31T16:00:00Z"), "Asia/Jayapura", "04:00")).toBe("2026-12-31");
  });
});
