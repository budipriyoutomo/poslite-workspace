import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { ensureToken } from "./token-file.ts";

describe("ensureToken (P1-5)", () => {
  it("makes a long random token once and keeps it for the next start", () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "bridge-")), "token");

    const first = ensureToken(file);
    const second = ensureToken(file);

    assert.equal(first.length >= 32, true);
    assert.equal(second, first);
    assert.equal(readFileSync(file, "utf8").trim(), first);
  });
});
