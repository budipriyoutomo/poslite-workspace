import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OpenBillList } from "./OpenBillList";

const line = { key: "k", productId: "P1", name: "Kopi", categoryName: "Minuman", unitPrice: 18_000, modifiers: [], note: "", quantity: 2 };
const bills = [{ id: "B1", tableId: "T1", tableLabel: "A1", lines: [line], discount: null, openedBy: "U1", openedAt: "2026-09-25T02:00:00.000Z", updatedAt: "2026-09-25T02:30:00.000Z" }];

describe("OpenBillList", () => {
  it("shows each open bill with its table, items and value before tax", () => {
    render(<OpenBillList bills={bills} timezone="Asia/Jakarta" onResume={vi.fn()} onCancel={vi.fn()} onMove={vi.fn()} />);

    const a1 = within(screen.getByRole("listitem", { name: "Meja A1" }));
    expect(a1.getByText("2 item · Rp 36.000")).toBeInTheDocument();
    expect(a1.getByText("Dibuka 09:00")).toBeInTheDocument();
  });

  it("resumes a bill", async () => {
    const onResume = vi.fn();
    render(<OpenBillList bills={bills} timezone="Asia/Jakarta" onResume={onResume} onCancel={vi.fn()} onMove={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Lanjutkan A1" }));

    expect(onResume).toHaveBeenCalledWith(bills[0]);
  });

  it("cancels a bill after confirmation", async () => {
    const onCancel = vi.fn();
    render(<OpenBillList bills={bills} timezone="Asia/Jakarta" onResume={vi.fn()} onCancel={onCancel} onMove={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Batalkan A1" }));
    await userEvent.click(await screen.findByRole("button", { name: "Batalkan bill" }));

    expect(onCancel).toHaveBeenCalledWith("B1");
  });

  it("hands a bill the kitchen already had straight to the void approval (ADR-028)", async () => {
    const onCancel = vi.fn();
    const sent = [{ ...bills[0]!, lines: [{ ...line, sentQuantity: 1 }] }];
    render(<OpenBillList bills={sent} timezone="Asia/Jakarta" onResume={vi.fn()} onCancel={onCancel} onMove={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Batalkan A1" }));

    expect(onCancel).toHaveBeenCalledWith("B1");
    expect(screen.queryByRole("button", { name: "Batalkan bill" })).not.toBeInTheDocument();
  });

  it("asks to move a bill to another table", async () => {
    const onMove = vi.fn();
    render(<OpenBillList bills={bills} timezone="Asia/Jakarta" onResume={vi.fn()} onCancel={vi.fn()} onMove={onMove} />);

    await userEvent.click(screen.getByRole("button", { name: "Pindah meja A1" }));

    expect(onMove).toHaveBeenCalledWith(bills[0]);
  });

  it("says when there is nothing open", () => {
    render(<OpenBillList bills={[]} timezone="Asia/Jakarta" onResume={vi.fn()} onCancel={vi.fn()} onMove={vi.fn()} />);

    expect(screen.getByText("Tidak ada bill terbuka")).toBeInTheDocument();
  });
});
