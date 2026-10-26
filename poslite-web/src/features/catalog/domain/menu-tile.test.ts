import { describe, expect, it } from "vitest";

import { categoryTone, initials } from "./menu-tile";

describe("menu tiles (15 · UX-06)", () => {
  it("names an item without a photo by its initials", () => {
    expect(initials("Nasi Gudeg Komplit")).toBe("NG");
    expect(initials("kopi")).toBe("KO");
    expect(initials("  Es  Teh ")).toBe("ET");
  });

  it("gives each category its own colour, in the categories' order, repeating after the palette", () => {
    const ids = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9"];
    const tones = ids.map((id) => categoryTone(ids, id));
    expect(new Set(tones.slice(0, 8)).size).toBe(8);
    expect(tones[8]).toBe(tones[0]);
  });

  it("gives an unknown category a neutral colour", () => {
    expect(categoryTone(["C1"], "C9")).toBe("neutral");
  });
});
