import { describe, expect, it } from "vitest";

import { newId } from "./new-id";

describe("newId", () => {
  it("returns a 26-char Crockford base32 ULID", () => {
    expect(newId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("sorts in creation order, even within the same millisecond", () => {
    const ids = Array.from({ length: 1_000 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
