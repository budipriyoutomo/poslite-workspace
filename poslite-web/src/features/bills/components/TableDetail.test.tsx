import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { OpenBillLine, OpenBillRow } from "@/shared/db";

import { tableTiles } from "../domain/table-status";
import { TableDetail } from "./TableDetail";

const NOW = new Date("2026-10-26T12:00:00.000Z");
const gudeg: OpenBillLine = { key: "k1", productId: "P1", name: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, modifiers: [], note: "", quantity: 2, sentQuantity: 2 };
const teh: OpenBillLine = { key: "k2", productId: "P2", name: "Es Teh", categoryName: "Minuman", unitPrice: 5_000, modifiers: [], note: "", quantity: 1 };
const bill = (lines: OpenBillLine[]): OpenBillRow => ({ id: "B1", tableId: "T1", tableLabel: "A1", lines, discount: null, openedBy: "U1", openedAt: "2026-10-26T11:35:00.000Z", updatedAt: "2026-10-26T11:35:00.000Z", guestCount: 3 });
const tileOf = (b: OpenBillRow | null) => tableTiles([{ id: "T1", label: "A1", area: "", sortOrder: 1 }], b ? [b] : [], NOW)[0]!;

function setup(b: OpenBillRow | null, canPay = true) {
  const on = { onOpen: vi.fn(), onAddOrder: vi.fn(), onPrint: vi.fn(), onPay: vi.fn(), onMove: vi.fn(), onSplit: vi.fn(), onCancel: vi.fn() };
  render(<TableDetail tile={tileOf(b)} total={57_750} canPay={canPay} {...on} />);
  return on;
}

describe("TableDetail (15 · UX-04)", () => {
  it("shows the table's items with what the kitchen already has", () => {
    setup(bill([gudeg, teh]));
    expect(screen.getByRole("heading", { name: "Meja A1" })).toBeInTheDocument();
    expect(screen.getByText("3 tamu · 25 mnt · Rp 57.750")).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "2× Nasi Gudeg" })).toHaveTextContent("Di dapur");
    expect(screen.getByRole("listitem", { name: "1× Es Teh" })).toHaveTextContent("Belum dikirim");
  });

  it("offers adding to the order first, then print, pay, move and split", async () => {
    const on = setup(bill([gudeg]));
    const actions = ["Tambah pesanan", "Cetak tagihan", "Bayar", "Pindah meja", "Pisah bill"];
    for (const name of actions) await userEvent.click(screen.getByRole("button", { name }));
    expect([on.onAddOrder, on.onPrint, on.onPay, on.onMove, on.onSplit].every((f) => f.mock.calls.length === 1)).toBe(true);
  });

  it("keeps cancelling apart, in red, and says it needs a manager when the kitchen has items", async () => {
    const on = setup(bill([gudeg]));
    const cancel = screen.getByRole("button", { name: "Batalkan bill" });
    expect(cancel).toHaveAttribute("data-variant", "destructive");
    expect(screen.getByText("Butuh PIN manajer")).toBeInTheDocument();
    await userEvent.click(cancel);
    expect(on.onCancel).toHaveBeenCalled();
  });

  it("asks to confirm cancelling a bill the kitchen has nothing of", async () => {
    const on = setup(bill([teh]));
    await userEvent.click(screen.getByRole("button", { name: "Batalkan bill" }));
    expect(on.onCancel).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Ya, batalkan" }));
    expect(on.onCancel).toHaveBeenCalled();
  });

  it("never offers a waiter the payment (ADR-031)", () => {
    setup(bill([gudeg]), false);
    expect(screen.queryByRole("button", { name: "Bayar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pisah bill" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cetak tagihan" })).toBeInTheDocument();
  });

  it("opens a bill on an empty table", async () => {
    const on = setup(null);
    expect(screen.getByText("Meja kosong")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Buka bill" }));
    expect(on.onOpen).toHaveBeenCalled();
  });
});
