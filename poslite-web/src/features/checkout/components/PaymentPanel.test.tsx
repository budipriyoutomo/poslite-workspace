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
});
