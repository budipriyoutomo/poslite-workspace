import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PaymentMethodRow } from "@/shared/db";

import { PaymentMethodPicker } from "./PaymentMethodPicker";

const m = (id: string, type: PaymentMethodRow["type"], name: string, sortOrder: number): PaymentMethodRow => ({ id, type, name, requiresReference: type !== "cash" && type !== "qris", sortOrder });
const METHODS = [
  m("cash", "cash", "Tunai", 1),
  m("qris", "qris", "QRIS", 2),
  m("bca", "debit", "Debit BCA", 3),
  m("mandiri", "debit", "Debit Mandiri", 4),
  m("visa", "credit_card", "Visa", 5),
  m("grab", "voucher", "GrabFood Voucher", 6),
];

function setup(selectedId = "cash") {
  const onChoose = vi.fn();
  render(<PaymentMethodPicker methods={METHODS} selectedId={selectedId} onChoose={onChoose} />);
  return { onChoose };
}

describe("PaymentMethodPicker (15 · UX-03)", () => {
  it("shows four buttons instead of one per method", () => {
    setup();
    const group = screen.getByRole("group", { name: "Metode bayar" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Tunai", "QRIS", "Kartu", "GrabFood Voucher"]);
  });

  it("marks the group of the chosen method", () => {
    setup("cash");
    expect(screen.getByRole("button", { name: "Tunai" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "QRIS" })).toHaveAttribute("aria-pressed", "false");
  });

  it("chooses a group's only method straight away", async () => {
    const { onChoose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "QRIS" }));
    expect(onChoose).toHaveBeenCalledWith(METHODS[1]);
  });

  it("lists a group's methods to pick from", async () => {
    const { onChoose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Kartu" }));
    const list = await screen.findByRole("dialog", { name: "Kartu" });
    expect(within(list).getAllByRole("button", { name: /Debit|Visa/ }).map((b) => b.textContent)).toEqual(["Debit BCA", "Debit Mandiri", "Visa"]);
    await userEvent.click(within(list).getByRole("button", { name: "Debit Mandiri" }));
    expect(onChoose).toHaveBeenCalledWith(METHODS[3]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the chosen method on its group's button", () => {
    setup("mandiri");
    expect(screen.getByRole("button", { name: "Kartu · Debit Mandiri" })).toHaveAttribute("aria-pressed", "true");
  });
});
