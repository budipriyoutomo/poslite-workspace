import { describe, expect, it } from "vitest";

import { buildRefundSlip, buildVoidSlip, type RefundSlipInput, type VoidSlipInput } from "./correction-slips";
import { renderText } from "./text-layout";

const voidInput: VoidSlipInput = {
  header: "NAMA RESTORAN",
  timezone: "Asia/Jakarta",
  receiptNo: "JKT01A-260925-0042",
  voidedAt: "2026-09-25T04:20:00.000Z", // 11:20 WIB
  voidedBy: "Siti",
  approvedBy: "Bu Rina",
  reason: "Salah input",
  lines: [
    { productName: "Nasi Gudeg", quantity: 2, amount: 70_000 },
    { productName: "Es Teh Manis", quantity: 1, amount: 5_000 },
  ],
  total: 77_963,
  paymentMethods: [{ name: "Tunai", isCash: true }],
};

const refundInput: RefundSlipInput = {
  header: "NAMA RESTORAN",
  timezone: "Asia/Jakarta",
  refundNo: "JKT01A-R260926-0001",
  receiptNo: "JKT01A-260925-0042",
  refundedAt: "2026-09-26T02:30:00.000Z", // 09:30 WIB
  refundedBy: "Siti",
  approvedBy: "Bu Rina",
  reason: "Pelanggan komplain",
  lines: [{ productName: "Nasi Gudeg", quantity: 1, amount: 31_500 }],
  total: 31_500,
  payments: [{ methodName: "Tunai", amount: 31_500, isCash: true }],
};

describe("void slip (58 mm)", () => {
  it("shows what was cancelled, when, by whom and why", () => {
    expect(renderText(buildVoidSlip(voidInput), 32)).toEqual([
      "         NAMA RESTORAN",
      "--------------------------------",
      "        ** SLIP VOID **",
      "Struk : JKT01A-260925-0042",
      "Waktu : 25/09/26 11:20",
      "Oleh  : Siti",
      "Setuju: Bu Rina",
      "Alasan: Salah input",
      "--------------------------------",
      "2x Nasi Gudeg             70.000",
      "1x Es Teh Manis            5.000",
      "--------------------------------",
      "TOTAL VOID                77.963",
      "Dibayar: Tunai",
      "--------------------------------",
      "Paraf:",
      "",
      "",
      "________________",
    ]);
  });

  it("leaves out the approver when a manager voided alone", () => {
    expect(renderText(buildVoidSlip({ ...voidInput, approvedBy: null }), 32).some((l) => l.startsWith("Setuju"))).toBe(false);
  });

  it("reminds to cancel non-cash payments at the EDC or bank app", () => {
    const text = renderText(buildVoidSlip({ ...voidInput, paymentMethods: [{ name: "Tunai", isCash: true }, { name: "QRIS", isCash: false }] }), 32).join("\n");

    expect(text).toContain("Dibayar: Tunai, QRIS");
    expect(text).toMatch(/Batalkan QRIS manual di\s+EDC\/aplikasi bank/);
  });
});

describe("refund slip (58 mm)", () => {
  it("shows the refund number, the original receipt, the items and how the money went back", () => {
    expect(renderText(buildRefundSlip(refundInput), 32)).toEqual([
      "         NAMA RESTORAN",
      "--------------------------------",
      "       ** SLIP REFUND **",
      "No    : JKT01A-R260926-0001",
      "Struk : JKT01A-260925-0042",
      "Waktu : 26/09/26 09:30",
      "Oleh  : Siti",
      "Setuju: Bu Rina",
      "Alasan: Pelanggan komplain",
      "--------------------------------",
      "1x Nasi Gudeg             31.500",
      "--------------------------------",
      "TOTAL REFUND              31.500",
      "Dikembalikan: Tunai       31.500",
      "--------------------------------",
      "Paraf:",
      "",
      "",
      "________________",
    ]);
  });

  it("reminds to send a non-cash refund from the EDC or bank app", () => {
    const text = renderText(buildRefundSlip({ ...refundInput, payments: [{ methodName: "Debit BCA", amount: 31_500, isCash: false }] }), 32).join("\n");

    expect(text).toMatch(/Kembalikan Debit BCA manual di\s+EDC\/aplikasi bank/);
  });

  it("fits 80 mm paper", () => {
    expect(renderText(buildRefundSlip(refundInput), 48)).toContain("TOTAL REFUND                              31.500");
  });
});
