import { describe, expect, it } from "vitest";

import { addLine, cartLines, changeQuantity, type CartLine, type NewLine, removeLine, repriceLines, setLineDiscount, updateLine } from "./cart";

const gudeg: NewLine = { productId: "P1", name: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, modifiers: [], note: "" };
const ayam = { optionId: "M1", groupId: "G1", name: "Tambah Ayam", price: 10_000 };
const telur = { optionId: "M2", groupId: "G1", name: "Tambah Telur", price: 5_000 };

describe("addLine", () => {
  it("adds a new line with quantity 1", () => {
    const lines = addLine([], gudeg);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ productId: "P1", quantity: 1 });
  });

  it("merges the same product with the same modifiers and note", () => {
    const lines = addLine(addLine([], { ...gudeg, modifiers: [ayam, telur] }), { ...gudeg, modifiers: [telur, ayam] });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(2);
  });

  it("keeps separate lines when modifiers differ", () => {
    expect(addLine(addLine([], gudeg), { ...gudeg, modifiers: [ayam] })).toHaveLength(2);
  });

  it("keeps separate lines when notes differ, ignoring surrounding spaces", () => {
    const lines = addLine(addLine(addLine([], { ...gudeg, note: "pedas" }), { ...gudeg, note: " pedas " }), gudeg);
    expect(lines.map((l) => l.quantity)).toEqual([2, 1]);
  });

  it("does not mutate the original cart", () => {
    const before: CartLine[] = addLine([], gudeg);
    addLine(before, gudeg);
    expect(before[0]!.quantity).toBe(1);
  });
});

describe("changeQuantity", () => {
  it("increments and decrements a line", () => {
    const [line] = addLine([], gudeg);
    expect(changeQuantity([line!], line!.key, +2)[0]!.quantity).toBe(3);
  });

  it("removes the line when quantity drops to zero", () => {
    const [line] = addLine([], gudeg);
    expect(changeQuantity([line!], line!.key, -1)).toEqual([]);
  });
});

describe("updateLine", () => {
  it("changes modifiers and note of a line", () => {
    const [line] = addLine([], gudeg);
    const [updated] = updateLine([line!], line!.key, { modifiers: [ayam], note: "tanpa sambal" });
    expect(updated).toMatchObject({ modifiers: [ayam], note: "tanpa sambal", quantity: 1 });
  });

  it("merges into an existing line that becomes identical", () => {
    let lines = addLine(addLine([], gudeg), { ...gudeg, modifiers: [ayam] });
    lines = changeQuantity(lines, lines[0]!.key, +1); // plain gudeg x2, gudeg+ayam x1
    const merged = updateLine(lines, lines[0]!.key, { modifiers: [ayam], note: "" });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.quantity).toBe(3);
  });
});

describe("removeLine", () => {
  it("removes only the given line", () => {
    const lines = addLine(addLine([], gudeg), { ...gudeg, modifiers: [ayam] });
    expect(removeLine(lines, lines[0]!.key).map((l) => l.modifiers)).toEqual([[ayam]]);
  });
});

describe("cartLines", () => {
  it("prices lines with the per-unit modifiers total", () => {
    const lines = addLine(addLine([], { ...gudeg, modifiers: [ayam, telur] }), { ...gudeg, modifiers: [ayam, telur] });
    expect(cartLines(lines)).toEqual([{ unitPrice: 25_000, modifiersTotal: 15_000, quantity: 2 }]);
  });
});

describe("setLineDiscount", () => {
  const kopi = { productId: "P1", categoryId: "C1", name: "Kopi", categoryName: "Minuman", unitPrice: 18_000, modifiers: [], note: "" };

  it("gives one line its own discount and clears it again", () => {
    const [line] = addLine([], kopi);
    const discounted = setLineDiscount([line!], line!.key, { type: "percentage", value: 10 });

    expect(discounted[0]!.discount).toEqual({ type: "percentage", value: 10 });
    expect(setLineDiscount(discounted, line!.key, null)[0]!.discount).toBeNull();
  });

  it("keeps the category for promotions", () => {
    expect(addLine([], kopi)[0]!.categoryId).toBe("C1");
  });
});

describe("repriceLines (ADR-029)", () => {
  const line = { productId: "P1", name: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, modifiers: [], note: "" };

  it("puts every line at its price on the new channel, keeping quantities", () => {
    const lines = addLine(addLine([], line), line);
    expect(repriceLines(lines, () => 30_000)?.map((l) => [l.unitPrice, l.quantity])).toEqual([[30_000, 2]]);
  });

  it("is null when a line is not sold on the new channel", () => {
    expect(repriceLines(addLine([], line), () => null)).toBeNull();
  });
});
