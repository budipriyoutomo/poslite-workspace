import { describe, expect, it } from "vitest";

import type { CartLine } from "./cart";
import { kitchenPending, markSent, reconcileSent, voidedUnits } from "./kitchen";

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

describe("voidedUnits", () => {
  it("is empty when nothing the kitchen had was taken off", () => {
    expect(voidedUnits([line("a", 2, 2)], [line("a", 3, 2), line("b", 1)])).toEqual([]);
  });

  it("lets units the kitchen never had go without a void", () => {
    expect(voidedUnits([line("a", 3, 1)], [line("a", 1, 1)])).toEqual([]);
  });

  it("voids the sent units a lower quantity takes off, priced with modifiers", () => {
    const pricey = { ...line("a", 3, 3), modifiers: [{ optionId: "M2", groupId: "G1", name: "Keju", price: 5_000 }] };
    expect(voidedUnits([pricey], [{ ...pricey, quantity: 1 }])).toEqual([
      { key: "a", productId: "P-a", name: "Menu a", modifiers: ["Keju"], unitPrice: 15_000, quantity: 2, amount: 30_000 },
    ]);
  });

  it("voids every sent unit of a removed line", () => {
    expect(voidedUnits([line("a", 2, 2), line("b", 1, 1)], [line("b", 1, 1)]).map((v) => [v.key, v.quantity])).toEqual([["a", 2]]);
  });

  it("treats a sent line whose note changed as voided (it is a new item for the kitchen)", () => {
    expect(voidedUnits([line("a", 1, 1)], [{ ...line("a2", 1, 1) }]).map((v) => v.key)).toEqual(["a"]);
  });
});

describe("reconcileSent", () => {
  it("keeps what was sent, never more than is left on the line", () => {
    expect(reconcileSent([line("a", 3, 3), line("b", 2, 1)], [line("a", 1, 3), line("b", 2, 1)]).map((l) => l.sentQuantity)).toEqual([1, 1]);
  });

  it("marks a line the saved bill did not have as not sent", () => {
    expect(reconcileSent([line("a", 1, 1)], [line("a2", 1, 1)])[0]!.sentQuantity).toBeUndefined();
  });
});
