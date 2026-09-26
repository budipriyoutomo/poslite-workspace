import { describe, expect, it } from "vitest";

import { slugify } from "./slug";

describe("slugify", () => {
  it.each([
    ["Warung Maharasa", "warung-maharasa"],
    ["  Kopi & Roti  ", "kopi-roti"],
    ["Café Ñusantara", "cafe-nusantara"],
    ["a".repeat(80), "a".repeat(63)],
  ])("%s → %s", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });
});
