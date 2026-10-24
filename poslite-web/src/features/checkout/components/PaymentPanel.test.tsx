import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PaymentMethodRow } from "@/shared/db";

import { PaymentPanel } from "./PaymentPanel";

const methods: PaymentMethodRow[] = [
  { id: "cash", type: "cash", name: "Tunai", requiresReference: false, sortOrder: 1 },
  { id: "qris", type: "qris", name: "QRIS", requiresReference: false, sortOrder: 2 },
  { id: "bca", type: "debit", name: "Debit BCA", requiresReference: true, sortOrder: 3 },
];

const setup = (total: number) => {
  const onConfirm = vi.fn();
  render(<PaymentPanel total={total} methods={methods} onConfirm={onConfirm} />);
  return onConfirm;
};
const click = (name: string | RegExp) => userEvent.click(screen.getByRole("button", { name }));
const summary = () => screen.getByRole("status", { name: "Ringkasan pembayaran" });

describe("PaymentPanel", () => {
  it("pays cash with a quick amount and shows the change", async () => {
    const onConfirm = setup(72_765);
    await click("Rp 100.000");
    expect(summary()).toHaveTextContent("Kembalian Rp 27.235");
    await click(/Selesaikan/);
    expect(onConfirm).toHaveBeenCalledWith([{ paymentMethodId: "cash", amount: 100_000, reference: null }]);
  });

  it("starts on the sales channel's payment method for the whole bill (ADR-029)", async () => {
    const onConfirm = vi.fn();
    render(<PaymentPanel total={69_300} methods={methods} initialMethodId="qris" onConfirm={onConfirm} />);

    await click(/Selesaikan/);

    expect(onConfirm).toHaveBeenCalledWith([{ paymentMethodId: "qris", amount: 69_300, reference: null }]);
  });

  it("blocks an underpaid order and shows what is missing", async () => {
    setup(72_765);
    await click("Rp 72.765"); // exact
    await click("Hapus digit");
    expect(summary()).toHaveTextContent("Kurang Rp 65.489");
    expect(screen.getByRole("button", { name: /Selesaikan/ })).toBeDisabled();
  });

  it("pays the exact remaining amount with QRIS", async () => {
    const onConfirm = setup(49_088);
    await click("QRIS");
    await click(/Selesaikan/);
    expect(onConfirm).toHaveBeenCalledWith([{ paymentMethodId: "qris", amount: 49_088, reference: null }]);
  });

  it("requires a reference for debit", async () => {
    const onConfirm = setup(25_000);
    await click("Debit BCA");
    expect(screen.getByRole("button", { name: /Selesaikan/ })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("No. referensi / approval"), "123456");
    await click(/Selesaikan/);
    expect(onConfirm).toHaveBeenCalledWith([{ paymentMethodId: "bca", amount: 25_000, reference: "123456" }]);
  });

  it("splits a bill between debit and cash", async () => {
    const onConfirm = setup(100_000);
    await click("Debit BCA");
    await click("C");
    for (const k of ["6", "0", "000"]) await click(k);
    await userEvent.type(screen.getByLabelText("No. referensi / approval"), "999");
    await click(/Pisah pembayaran/);
    await click("Tunai");
    await click("Rp 50.000");
    expect(summary()).toHaveTextContent("Kembalian Rp 10.000");
    await click(/Selesaikan/);
    expect(onConfirm).toHaveBeenCalledWith([
      { paymentMethodId: "bca", amount: 60_000, reference: "999" },
      { paymentMethodId: "cash", amount: 50_000, reference: null },
    ]);
  });

  it("pays by dynamic QRIS: the confirmed charge fills in the amount and reference", async () => {
    const onConfirm = vi.fn();
    const qris = {
      create: vi.fn(async (id: string, amount: number) => ({ id, amount, status: "pending" as const, qrString: "FAKEQRIS", expiresAt: "2026-09-27T03:15:00Z" })),
      status: vi.fn(async (id: string) => ({ id, amount: 72_765, status: "paid" as const, qrString: "FAKEQRIS", expiresAt: "2026-09-27T03:15:00Z" })),
    };
    render(<PaymentPanel total={72_765} methods={methods} onConfirm={onConfirm} qris={qris} newId={() => "01K5ZK00000000000000000001"} qrisPollMs={0} />);

    await click("QRIS");
    await click("QR dinamis");
    await screen.findByText(/QRIS · 01K5ZK00000000000000000001/);
    await click(/Selesaikan/);

    expect(onConfirm).toHaveBeenCalledWith([{ paymentMethodId: "qris", amount: 72_765, reference: "01K5ZK00000000000000000001" }]);
  });

  it("offers only static QRIS when there is no dynamic QRIS client (offline / demo)", async () => {
    setup(72_765);
    await click("QRIS");

    expect(screen.queryByRole("button", { name: "QR dinamis" })).not.toBeInTheDocument();
    expect(screen.getByText(/pakai QRIS statis/)).toBeInTheDocument();
  });
});
