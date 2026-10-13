import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RefundDialog } from "./RefundDialog";

const SOURCE = {
  orderId: "O1",
  receiptNo: "JKT01A-260925-0001",
  total: 72_765,
  discountAmount: 7_000,
  lines: [{ id: "L1", productName: "Nasi Gudeg", quantity: 2, gross: 70_000, lineDiscount: 0, refunded: 0 }],
};
const METHODS = [
  { id: "PM1", name: "Tunai" },
  { id: "PM2", name: "QRIS" },
];
const MANAGER = { id: "U2", name: "Bu Rina" };

function open(props: Partial<Parameters<typeof RefundDialog>[0]> = {}) {
  const onConfirm = vi.fn(async () => {});
  render(
    <RefundDialog
      source={SOURCE}
      methods={METHODS}
      defaultMethodId="PM1"
      actorIsManager={false}
      approvers={[MANAGER]}
      verifyApprover={async (_, pin) => pin === "2468"}
      onConfirm={onConfirm}
      onClose={() => {}}
      {...props}
    />,
  );
  return onConfirm;
}

describe("RefundDialog (ADR-023)", () => {
  it("prices the chosen units with the shared allocation and refunds after a manager approves", async () => {
    const onConfirm = open();
    await userEvent.click(screen.getByRole("button", { name: "Tambah Nasi Gudeg" }));
    expect(screen.getByRole("button", { name: "Refund Rp 36.383" })).toBeDisabled(); // no reason, no approval yet

    await userEvent.selectOptions(screen.getByLabelText("Alasan"), "Pelanggan batal");
    await userEvent.type(screen.getByLabelText("PIN manajer"), "2468");
    await userEvent.click(screen.getByRole("button", { name: "Setujui" }));
    await userEvent.click(await screen.findByRole("button", { name: "Refund Rp 36.383" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ picks: { L1: 1 }, paymentMethodId: "PM1", reason: "Pelanggan batal", approvedBy: "U2" }));
  });

  it("never lets the cashier refund more than is left", async () => {
    open({ source: { ...SOURCE, lines: [{ ...SOURCE.lines[0]!, refunded: 1 }] } });
    await userEvent.click(screen.getByRole("button", { name: "Tambah Nasi Gudeg" }));

    expect(screen.getByLabelText("Jumlah refund Nasi Gudeg")).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "Tambah Nasi Gudeg" })).toBeDisabled();
  });

  it("rejects a wrong manager PIN", async () => {
    open();
    await userEvent.type(screen.getByLabelText("PIN manajer"), "0000");
    await userEvent.click(screen.getByRole("button", { name: "Setujui" }));

    expect(await screen.findByText("PIN salah")).toBeInTheDocument();
  });

  it("a manager refunds without anyone else's approval", async () => {
    const onConfirm = open({ actorIsManager: true });
    await userEvent.click(screen.getByRole("button", { name: "Tambah Nasi Gudeg" }));
    await userEvent.selectOptions(screen.getByLabelText("Alasan"), "Salah input");
    await userEvent.click(screen.getByRole("button", { name: "Refund Rp 36.383" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ approvedBy: null })));
    expect(screen.queryByLabelText("PIN manajer")).not.toBeInTheDocument();
  });
});
