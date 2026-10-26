import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { OpenBillRow } from "@/shared/db";

import { tableTiles } from "../domain/table-status";
import { TableBoard } from "./TableBoard";

const NOW = new Date("2026-10-26T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const tables = [
  { id: "T1", label: "A1", area: "Dalam", seats: 4, sortOrder: 1 },
  { id: "T2", label: "A2", area: "Dalam", seats: 4, sortOrder: 2 },
  { id: "T3", label: "B1", area: "Teras", seats: 2, sortOrder: 3 },
  { id: "T4", label: "C1", area: "Teras", seats: 2, sortOrder: 4 },
];
const bill = (id: string, tableId: string, tableLabel: string, over: Partial<OpenBillRow> = {}): OpenBillRow => ({
  id,
  tableId,
  tableLabel,
  lines: [],
  discount: null,
  openedBy: "U1",
  openedAt: minutesAgo(25),
  updatedAt: minutesAgo(25),
  ...over,
});
const bills = [bill("B1", "T1", "A1", { guestCount: 4 }), bill("B2", "T3", "B1", { printedAt: minutesAgo(1) }), bill("B3", "T4", "C1", { openedAt: minutesAgo(120), printedAt: minutesAgo(1) })];

function setup(props: { isPicking?: boolean } = {}) {
  const onSelect = vi.fn();
  render(<TableBoard tiles={tableTiles(tables, bills, NOW)} areas={["Dalam", "Teras"]} totalOf={() => 86_625} onSelect={onSelect} {...props} />);
  return { onSelect };
}

describe("TableBoard (15 · UX-04)", () => {
  it("shows each table's status, guests, time sat and total", () => {
    setup();
    const a1 = screen.getByRole("button", { name: /^Meja A1/ });
    expect(a1).toHaveAttribute("data-state", "occupied");
    expect(a1).toHaveAccessibleName("Meja A1 · Terisi · 4 tamu · 25 mnt · Rp 86.625");
    expect(screen.getByRole("button", { name: /^Meja A2/ })).toHaveAccessibleName("Meja A2 · Kosong");
  });

  it("colours a late table red even when its bill was printed", () => {
    setup();
    expect(screen.getByRole("button", { name: /^Meja B1/ })).toHaveAttribute("data-state", "printed");
    const c1 = screen.getByRole("button", { name: /^Meja C1/ });
    expect(c1).toHaveAttribute("data-state", "late");
    expect(c1).toHaveAccessibleName(/Lewat 90 mnt · Tagihan dicetak/);
  });

  it("counts the tables per status in the legend", () => {
    setup();
    const legend = within(screen.getByRole("list", { name: "Status meja" }));
    expect(legend.getByText("Kosong").parentElement).toHaveTextContent("Kosong1");
    expect(legend.getByText("Terisi").parentElement).toHaveTextContent("Terisi1");
    expect(legend.getByText("Tagihan dicetak").parentElement).toHaveTextContent("Tagihan dicetak1");
    expect(legend.getByText("Lewat 90 mnt").parentElement).toHaveTextContent("Lewat 90 mnt1");
  });

  it("shows only the tables of the chosen area", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Teras" }));

    expect(screen.queryByRole("button", { name: /^Meja A1/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Meja B1/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Semua" }));
    expect(screen.getByRole("button", { name: /^Meja A1/ })).toBeInTheDocument();
  });

  it("hands over the table tapped", async () => {
    const { onSelect } = setup();
    await userEvent.click(screen.getByRole("button", { name: /^Meja A2/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ label: "A2", state: "empty" }));
  });

  it("lets only a free table be picked for a new bill", () => {
    setup({ isPicking: true });
    expect(screen.getByRole("button", { name: /^Meja A1/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Meja A2/ })).toBeEnabled();
  });
});
