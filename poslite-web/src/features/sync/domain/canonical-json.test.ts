import { describe, expect, it } from "vitest";

import { canonicalJson } from "./canonical-json";

describe("canonicalJson (ADR-024)", () => {
  it("sorts keys at every level and drops spaces, like json.dumps(sort_keys=True) on the server", () => {
    expect(canonicalJson({ b: [{ z: 1, a: "é" }], a: null })).toBe('{"a":null,"b":[{"a":"é","z":1}]}');
  });
});
