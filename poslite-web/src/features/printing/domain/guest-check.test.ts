import { describe, expect, it } from "vitest";

import { buildGuestCheck, type GuestCheckInput } from "./guest-check";
import { renderText } from "./text-layout";

// 15 · UX-04: the bill a table asks for before paying. Not a receipt: no number, no payment.
const check: GuestCheckInput = {
  header: "NAMA RESTORAN",
  timezone: "Asia/Jakarta",
  tableLabel: "A1",
  guestCount: 4,
  printedBy: "Siti",
  printedAt: "2026-09-25T04:03:00.000Z", // 11:03 WIB
  lines: [
    { productName: "Nasi Gudeg", quantity: 2, unitPrice: 25_000, notes: "", modifiers: [{ name: "Tambah Ayam", price: 10_000 }] },
    { productName: "Es Teh Manis", quantity: 1, unitPrice: 5_000, notes: "", modifiers: [] },
  ],
  discount: null,
  rates: { serviceBps: 500, taxBps: 1_000 },
  subtotal: 75_000,
  discountAmount: 0,
  serviceCharge: 3_750,
  tax: 7_875,
  total: 86_625,
};

describe("guest check (58 mm, 32 columns)", () => {
  it("lists the table's order and what it comes to, marked as not a receipt", () => {
    expect(renderText(buildGuestCheck(check), 32)).toEqual([
      "         NAMA RESTORAN",
      "--------------------------------",
      "         ** TAGIHAN **",
      "Meja : A1 (4 tamu)",
      "Oleh : Siti       25/09/26 11:03",
      "--------------------------------",
      "2x Nasi Gudeg             70.000",
      "   + Tambah Ayam",
      "1x Es Teh Manis            5.000",
      "--------------------------------",
      "Subtotal                  75.000",
      "Service 5%                 3.750",
      "PB1 10%                    7.875",
      "TOTAL                     86.625",
      "--------------------------------",
      " Bukan bukti pembayaran. Struk",
      "      dicetak setelah bayar.",
    ]);
  });

  it("leaves the guests out when nobody asked", () => {
    expect(renderText(buildGuestCheck({ ...check, guestCount: null }), 32)).toContain("Meja : A1");
  });
});
