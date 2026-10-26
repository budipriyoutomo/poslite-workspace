import { describe, expect, it } from "vitest";

import { areasOf, countByState, tableTiles } from "./table-status";

const NOW = new Date("2026-10-26T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const table = (id: string, label: string, area = "", sortOrder = 0) => ({ id, label, area, sortOrder });
const bill = (id: string, tableId: string | null, tableLabel: string, over: { openedAt?: string; printedAt?: string | null } = {}) => ({
  id,
  tableId,
  tableLabel,
  openedAt: minutesAgo(10),
  ...over,
});

describe("tableTiles (15 · UX-04)", () => {
  it("shows a table without a bill as empty", () => {
    const [tile] = tableTiles([table("T1", "A1")], [], NOW);
    expect(tile).toMatchObject({ label: "A1", state: "empty", bill: null });
  });

  it("shows a table with a bill as occupied, with how long the guests have sat", () => {
    const [tile] = tableTiles([table("T1", "A1")], [bill("B1", "T1", "A1", { openedAt: minutesAgo(25) })], NOW);
    expect(tile).toMatchObject({ state: "occupied", minutes: 25, isPrinted: false });
  });

  it("shows a printed bill", () => {
    const [tile] = tableTiles([table("T1", "A1")], [bill("B1", "T1", "A1", { printedAt: minutesAgo(1) })], NOW);
    expect(tile).toMatchObject({ state: "printed", isPrinted: true });
  });

  it("turns a table late after 90 minutes", () => {
    const [atLimit] = tableTiles([table("T1", "A1")], [bill("B1", "T1", "A1", { openedAt: minutesAgo(90) })], NOW);
    const [late] = tableTiles([table("T1", "A1")], [bill("B1", "T1", "A1", { openedAt: minutesAgo(91) })], NOW);
    expect([atLimit!.state, late!.state]).toEqual(["occupied", "late"]);
  });

  it("keeps a late table late even when its bill was printed, still marking the print", () => {
    const [tile] = tableTiles([table("T1", "A1")], [bill("B1", "T1", "A1", { openedAt: minutesAgo(120), printedAt: minutesAgo(5) })], NOW);
    expect(tile).toMatchObject({ state: "late", isPrinted: true });
  });

  it("follows the tables' order, then adds bills on a table the outlet does not list", () => {
    const tiles = tableTiles([table("T2", "A2", "", 2), table("T1", "A1", "", 1)], [bill("B9", null, "Teras 9"), bill("B1", "T1", "A1")], NOW);
    expect(tiles.map((t) => [t.label, t.state])).toEqual([
      ["A1", "occupied"],
      ["A2", "empty"],
      ["Teras 9", "occupied"],
    ]);
  });
});

describe("countByState", () => {
  it("counts the tables per state for the legend", () => {
    const tiles = tableTiles([table("T1", "A1"), table("T2", "A2"), table("T3", "A3")], [bill("B1", "T1", "A1"), bill("B2", "T2", "A2", { printedAt: minutesAgo(1) })], NOW);
    expect(countByState(tiles)).toEqual({ empty: 1, occupied: 1, printed: 1, late: 0 });
  });
});

describe("areasOf", () => {
  it("lists the outlet's areas once each, in the tables' order; tables without an area have none", () => {
    expect(areasOf([table("T1", "B1", "Teras", 3), table("T2", "A1", "Dalam", 1), table("T3", "X", "", 2), table("T4", "A2", "Dalam", 4)])).toEqual(["Dalam", "Teras"]);
  });
});
