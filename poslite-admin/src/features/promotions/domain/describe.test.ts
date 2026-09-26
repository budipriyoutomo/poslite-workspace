import { describe, expect, it } from "vitest";

import { describeRule, describeSchedule } from "./describe";

const base = { days_of_week: [], start_time: null, end_time: null, starts_on: null, ends_on: null };

describe("describeRule", () => {
  it("shows percent off", () => {
    expect(describeRule({ type: "percent_off", percentage: 20, buy_qty: null, get_qty: null })).toBe("Diskon 20%");
  });

  it("shows buy x get y", () => {
    expect(describeRule({ type: "buy_x_get_y", percentage: null, buy_qty: 2, get_qty: 1 })).toBe("Beli 2 gratis 1");
  });
});

describe("describeSchedule", () => {
  it("is always on without restrictions", () => {
    expect(describeSchedule(base)).toBe("Setiap hari");
  });

  it("joins weekdays, hours and dates", () => {
    expect(describeSchedule({ ...base, days_of_week: [1, 2, 3, 4, 5], start_time: "14:00", end_time: "17:00", ends_on: "2026-12-31" })).toBe(
      "Sen, Sel, Rab, Kam, Jum · 14:00–17:00 · s.d. 2026-12-31",
    );
  });
});
