import { describe, expect, it } from "vitest";

import { activeOrderType, orderTypes } from "./order-types";

const ch = (id: string, name: string, kind: "dine_in" | "take_away" | "delivery", sortOrder: number) => ({ id, name, kind, sortOrder });

describe("order types (15 · UX-06)", () => {
  it("lists the brand's channels in their order, dine-in included", () => {
    const types = orderTypes([ch("GF", "GoFood", "delivery", 3), ch("DI", "Dine In", "dine_in", 1), ch("TA", "Take Away", "take_away", 2)]);
    expect(types.map((t) => [t.value, t.label, t.isDineIn])).toEqual([
      ["DI", "Dine In", true],
      ["TA", "Take Away", false],
      ["GF", "GoFood", false],
    ]);
  });

  it("offers eat-in and take-away on a device without channels", () => {
    expect(orderTypes([]).map((t) => [t.label, t.isDineIn])).toEqual([
      ["Makan di tempat", true],
      ["Bawa pulang", false],
    ]);
  });

  it("is dine-in while the cart holds a table's bill, else the sale's channel", () => {
    const types = orderTypes([ch("DI", "Dine In", "dine_in", 1), ch("TA", "Take Away", "take_away", 2), ch("GF", "GoFood", "delivery", 3)]);
    expect(activeOrderType(types, { hasBill: true, channelId: "GF" })).toBe("DI");
    expect(activeOrderType(types, { hasBill: false, channelId: "GF" })).toBe("GF");
    expect(activeOrderType(orderTypes([]), { hasBill: false, channelId: null })).toBe("take_away");
  });
});
