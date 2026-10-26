import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TablePicker } from "./TablePicker";

const tables = [
  { id: "T1", label: "A1", area: "Dalam", seats: 4, sortOrder: 0 },
  { id: "T2", label: "A2", area: "Dalam", seats: 2, sortOrder: 1 },
];

const onA2 = { id: "B2", tableId: "T2", tableLabel: "A2", lines: [], discount: null, openedBy: "U1", openedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

describe("TablePicker", () => {
  it("picks a free table; a table with a bill shows its status and cannot be picked (15 · UX-04)", async () => {
    const onPick = vi.fn();
    render(<TablePicker tables={tables} bills={[onA2]} onPick={onPick} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: /A2/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /A2/ })).toHaveAttribute("data-state", "occupied");
    await userEvent.click(screen.getByRole("button", { name: /A1/ }));

    expect(onPick).toHaveBeenCalledWith({ tableId: "T1", tableLabel: "A1" });
  });

  it("takes a free-text table when the outlet has no tables", async () => {
    const onPick = vi.fn();
    render(<TablePicker tables={[]} bills={[]} onPick={onPick} onClose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Nomor meja"), "12");
    await userEvent.click(screen.getByRole("button", { name: "Pakai" }));

    expect(onPick).toHaveBeenCalledWith({ tableId: null, tableLabel: "12" });
  });
});
