import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { BillVoidDialog } from "./BillVoidDialog";

const gudeg = { key: "g", productId: "P1", name: "Nasi Gudeg", modifiers: [], unitPrice: 25_000, quantity: 2, amount: 50_000 };
const teh = { key: "t", productId: "P2", name: "Es Teh", modifiers: [], unitPrice: 5_000, quantity: 1, amount: 5_000 };
const approvers = [{ id: "M1", name: "Bu Rina" }];

function setup(props: Partial<ComponentProps<typeof BillVoidDialog>> = {}) {
  const onConfirm = vi.fn(async () => {});
  render(
    <BillVoidDialog
      scope="bill"
      tableLabel="A3"
      cashierName="Siti"
      voided={[gudeg, teh]}
      actorIsManager={false}
      approvers={approvers}
      verifyApprover={async (_id, pin) => pin === "1234"}
      onConfirm={onConfirm}
      onClose={() => {}}
      {...props}
    />,
  );
  return { onConfirm };
}

async function approve(pin = "1234") {
  await userEvent.type(screen.getByLabelText("PIN manajer"), pin);
  await userEvent.click(screen.getByRole("button", { name: "Setujui" }));
}

describe("BillVoidDialog (ADR-028, 15 · UX-05)", () => {
  it("names the whole bill when the table is cancelled", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Batalkan bill meja A3" })).toBeInTheDocument();
  });

  it("names the item when one sent line is reduced", () => {
    setup({ scope: "line", voided: [{ ...gudeg, quantity: 1, amount: 25_000 }] });
    expect(screen.getByRole("dialog", { name: "Batalkan 1× Nasi Gudeg" })).toBeInTheDocument();
  });

  it("names the table when several sent lines are reduced", () => {
    setup({ scope: "line" });
    expect(screen.getByRole("dialog", { name: "Batalkan item meja A3" })).toBeInTheDocument();
  });

  it("shows what the kitchen already had and its value", () => {
    setup();
    expect(screen.getByText("2x Nasi Gudeg")).toBeInTheDocument();
    expect(screen.getByText(/50\.000/)).toBeInTheDocument();
  });

  it("warns how many items worth how much already went out, who is recorded, and what follows", () => {
    setup();
    const warning = screen.getByRole("note");
    expect(warning).toHaveTextContent("3 item senilai Rp 55.000 sudah dikirim ke dapur/bar");
    expect(warning).toHaveTextContent("Dicatat atas nama Siti");
    expect(warning).toHaveTextContent("laporan owner");
    expect(warning).toHaveTextContent("tiket BATAL");
  });

  it("offers the restaurant's standard reasons", () => {
    setup();
    const options = within(screen.getByLabelText("Alasan")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Pilih alasan", "Tamu batal/pergi", "Salah input", "Menu habis", "Kualitas/komplain", "Lainnya"]);
  });

  it("puts the value on the red button", () => {
    setup();
    expect(screen.getByRole("button", { name: "Batalkan bill · Rp 55.000" })).toBeInTheDocument();
  });

  it("needs a reason and a manager's PIN from a cashier", async () => {
    const { onConfirm } = setup();
    const confirm = screen.getByRole("button", { name: /^Batalkan bill ·/ });

    await userEvent.selectOptions(screen.getByLabelText("Alasan"), "Tamu batal/pergi");
    expect(confirm).toBeDisabled();
    await approve();
    await userEvent.click(confirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ reason: "Tamu batal/pergi", approvedBy: "M1" }));
  });

  it("needs a note for Lainnya", async () => {
    setup({ actorIsManager: true });
    await userEvent.selectOptions(screen.getByLabelText("Alasan"), "Lainnya");
    expect(screen.getByRole("button", { name: /^Batalkan bill ·/ })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Alasan lain"), "Meja salah pesan");
    expect(screen.getByRole("button", { name: /^Batalkan bill ·/ })).toBeEnabled();
  });

  it("keeps the items when the PIN is wrong", async () => {
    const { onConfirm } = setup({ scope: "line" });
    await userEvent.selectOptions(screen.getByLabelText("Alasan"), "Salah input");
    await approve("0000");

    expect(screen.getByRole("button", { name: /^Batalkan item ·/ })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
