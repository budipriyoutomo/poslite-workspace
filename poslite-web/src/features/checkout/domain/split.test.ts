import { describe, expect, it } from "vitest";

import { canSplit, splitLines } from "./split";

const kopi = { key: "k", name: "Kopi", quantity: 3, discount: null };
const nasi = { key: "n", name: "Nasi", quantity: 1, discount: { type: "percentage" as const, value: 10 } };

describe("splitLines", () => {
  it("moves the chosen quantities to the part being paid", () => {
    expect(splitLines([kopi, nasi], { k: 1, n: 1 })).toEqual({
      paying: [{ ...kopi, quantity: 1 }, nasi],
      remaining: [{ ...kopi, quantity: 2 }],
    });
  });

  it("leaves lines that were not chosen on the bill", () => {
    expect(splitLines([kopi, nasi], { k: 3 })).toEqual({ paying: [kopi], remaining: [nasi] });
  });

  it("counts units already sent to the kitchen against the part paid first", () => {
    const { paying, remaining } = splitLines([{ key: "g", quantity: 3, sentQuantity: 2 }], { g: 1 });

    expect(paying).toEqual([{ key: "g", quantity: 1, sentQuantity: 1 }]);
    expect(remaining).toEqual([{ key: "g", quantity: 2, sentQuantity: 1 }]);
  });

  it("leaves nothing sent on the bill when the paid part takes all sent units", () => {
    const { remaining } = splitLines([{ key: "g", quantity: 3, sentQuantity: 1 }], { g: 2 });

    expect(remaining).toEqual([{ key: "g", quantity: 1, sentQuantity: 0 }]);
  });

  it("rejects paying nothing", () => {
    expect(() => splitLines([kopi], { k: 0 })).toThrow(RangeError);
  });

  it("rejects more than the line has", () => {
    expect(() => splitLines([kopi], { k: 4 })).toThrow(RangeError);
  });
});

describe("canSplit", () => {
  it("allows a percentage order discount, which each part carries", () => {
    expect(canSplit({ type: "percentage", value: 10 })).toBe(true);
    expect(canSplit(null)).toBe(true);
  });

  it("forbids a fixed order discount (06 Open Bill rule 3)", () => {
    expect(canSplit({ type: "fixed", value: 5_000 })).toBe(false);
  });
});
