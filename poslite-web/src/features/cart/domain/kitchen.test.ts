import { describe, expect, it } from "vitest";

import type { CartLine } from "./cart";
import { kitchenPending, markSent } from "./kitchen";

const line = (key: string, quantity: number, sentQuantity?: number): CartLine => ({
  key,
  productId: `P-${key}`,
  name: `Menu ${key}`,
  categoryName: "Makanan",
  unitPrice: 10_000,
  modifiers: [{ optionId: "M1", groupId: "G1", name: "Pedas", price: 0 }],
  note: "tanpa bawang",
  quantity,
  ...(sentQuantity !== undefined && { sentQuantity }),
});

describe("kitchenPending", () => {
  it("sends every unit of lines the kitchen has not seen", () => {
    expect(kitchenPending([line("a", 2)])).toEqual([{ key: "a", productId: "P-a", name: "Menu a", quantity: 2, modifiers: ["Pedas"], note: "tanpa bawang" }]);
  });

  it("sends only the units added since the last ticket", () => {
    expect(kitchenPending([line("a", 3, 1), line("b", 1, 1)]).map((l) => [l.key, l.quantity])).toEqual([["a", 2]]);
  });

  it("sends nothing for a line reduced below what was sent", () => {
    expect(kitchenPending([line("a", 1, 2)])).toEqual([]);
  });
});

describe("markSent", () => {
  it("records the quantity that went on the ticket, for the lines that printed", () => {
    expect(markSent([line("a", 3, 1), line("b", 2)], { a: 3 }).map((l) => l.sentQuantity)).toEqual([3, undefined]);
  });
});
