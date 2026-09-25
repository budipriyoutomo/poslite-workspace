// @vitest-environment node
import { pbkdf2Sync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashPin, pinMatches } from "./pin-hasher";

const salt = Buffer.from("poslite-test-salt").toString("base64");

describe("hashPin", () => {
  it("matches PBKDF2-SHA256 (32 bytes, base64) as computed by the server", async () => {
    const expected = pbkdf2Sync("1234", Buffer.from(salt, "base64"), 1_000, 32, "sha256").toString("base64");
    expect(await hashPin("1234", salt, 1_000)).toBe(expected);
  });
});

describe("pinMatches", () => {
  it("accepts the right PIN and rejects a wrong one", async () => {
    const pinHash = await hashPin("1234", salt, 1_000);
    expect(await pinMatches("1234", { pinHash, pinSalt: salt, pinIterations: 1_000 })).toBe(true);
    expect(await pinMatches("1235", { pinHash, pinSalt: salt, pinIterations: 1_000 })).toBe(false);
  });
});
