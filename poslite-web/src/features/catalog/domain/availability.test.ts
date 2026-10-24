import { describe, expect, it } from "vitest";

import { endOfBusinessDate, sellsNow } from "./availability";

const NOW = new Date("2026-09-25T05:00:00.000Z"); // 12:00 WIB

describe("endOfBusinessDate (P1-2)", () => {
  it("is the next cutoff in the outlet's time zone: 04:00 WIB tomorrow", () => {
    expect(endOfBusinessDate(NOW, "Asia/Jakarta", "04:00")).toBe("2026-09-25T21:00:00.000Z");
  });

  it("before the cutoff the business day is still yesterday's, so it ends today at the cutoff", () => {
    expect(endOfBusinessDate(new Date("2026-09-25T19:30:00.000Z"), "Asia/Jakarta", "04:00")).toBe("2026-09-25T21:00:00.000Z"); // 02:30 WIB
  });

  it("works in other Indonesian time zones", () => {
    expect(endOfBusinessDate(NOW, "Asia/Makassar", "04:00")).toBe("2026-09-25T20:00:00.000Z");
  });
});

describe("sellsNow", () => {
  const product = { isAvailable: true, unavailableUntil: null };

  it("follows the server when this device changed nothing", () => {
    expect(sellsNow(product, undefined, NOW)).toBe(true);
    expect(sellsNow({ isAvailable: false, unavailableUntil: null }, undefined, NOW)).toBe(false);
  });

  it("sells again once a sold-out mark from the server has run out", () => {
    expect(sellsNow({ isAvailable: false, unavailableUntil: "2026-09-25T04:00:00.000Z" }, undefined, NOW)).toBe(true);
    expect(sellsNow({ isAvailable: false, unavailableUntil: "2026-09-25T21:00:00.000Z" }, undefined, NOW)).toBe(false);
  });

  it("takes this device's own mark first, until it runs out", () => {
    expect(sellsNow(product, { productId: "P1", isAvailable: false, until: "2026-09-25T21:00:00.000Z", changedAt: NOW.toISOString() }, NOW)).toBe(false);
    expect(sellsNow(product, { productId: "P1", isAvailable: false, until: "2026-09-25T04:00:00.000Z", changedAt: NOW.toISOString() }, NOW)).toBe(true);
  });
});
