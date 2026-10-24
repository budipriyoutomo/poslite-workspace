import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BillVoidDialog } from "./BillVoidDialog";

const voided = [{ key: "g", productId: "P1", name: "Nasi Gudeg", modifiers: [], unitPrice: 25_000, quantity: 2, amount: 50_000 }];
const approvers = [{ id: "M1", name: "Bu Rina" }];

describe("BillVoidDialog (ADR-028)", () => {
  it("shows what the kitchen already had and its value", () => {
    render(<BillVoidDialog tableLabel="A3" voided={voided} actorIsManager approvers={[]} verifyApprover={async () => false} onConfirm={async () => {}} onClose={() => {}} />);

    expect(screen.getByText("2x Nasi Gudeg")).toBeInTheDocument();
    expect(screen.getByText(/50\.000/)).toBeInTheDocument();
  });

  it("needs a reason and a manager's PIN from a cashier", async () => {
    const onConfirm = vi.fn(async () => {});
    const verify = vi.fn(async (_id: string, pin: string) => pin === "1234");
    render(<BillVoidDialog tableLabel="A3" voided={voided} actorIsManager={false} approvers={approvers} verifyApprover={verify} onConfirm={onConfirm} onClose={() => {}} />);
    const confirm = screen.getByRole("button", { name: "Batalkan item" });

    await userEvent.selectOptions(screen.getByLabelText("Alasan"), "Pelanggan batal");
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText("PIN manajer"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Setujui" }));
    await userEvent.click(confirm);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ reason: "Pelanggan batal", approvedBy: "M1" }));
  });

  it("keeps the items when the PIN is wrong", async () => {
    const onConfirm = vi.fn(async () => {});
    render(<BillVoidDialog tableLabel="A3" voided={voided} actorIsManager={false} approvers={approvers} verifyApprover={async () => false} onConfirm={onConfirm} onClose={() => {}} />);

    await userEvent.selectOptions(screen.getByLabelText("Alasan"), "Salah input");
    await userEvent.type(screen.getByLabelText("PIN manajer"), "0000");
    await userEvent.click(screen.getByRole("button", { name: "Setujui" }));

    expect(screen.getByRole("button", { name: "Batalkan item" })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
