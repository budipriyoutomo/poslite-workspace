import { describe, expect, it } from "vitest";

import { buildReceipt, type ReceiptInput } from "./receipt-builder";
import { renderText } from "./text-layout";

// The example receipt from docs/architecture/04-printing.md ("Layout Struk").
const example: ReceiptInput = {
  header: "NAMA RESTORAN\nJl. Contoh No. 1, Jakarta",
  footer: "Terima kasih!",
  timezone: "Asia/Jakarta",
  order: {
    receiptNo: "JKT01A-260925-0042",
    cashierName: "Budi",
    createdAt: "2026-09-25T04:03:00.000Z", // 11:03 WIB
    status: "paid",
    lines: [
      { productName: "Nasi Gudeg", quantity: 2, unitPrice: 25_000, notes: "tidak pedas", modifiers: [{ name: "Tambah Ayam", price: 10_000 }] },
      { productName: "Es Teh Manis", quantity: 1, unitPrice: 5_000, notes: "", modifiers: [] },
    ],
    discount: { type: "percentage", value: 10 },
    rates: { serviceBps: 500, taxBps: 1_000 },
    subtotal: 75_000,
    discountAmount: 7_500,
    serviceCharge: 3_375,
    tax: 7_088,
    total: 77_963,
    changeAmount: 22_037,
  },
  payments: [{ methodName: "Tunai", amount: 100_000 }],
};

describe("receipt (58 mm, 32 columns)", () => {
  it("matches the documented layout", () => {
    expect(renderText(buildReceipt(example), 32)).toEqual([
      "         NAMA RESTORAN",
      "   Jl. Contoh No. 1, Jakarta",
      "--------------------------------",
      "No   : JKT01A-260925-0042",
      "Kasir: Budi       25/09/26 11:03",
      "--------------------------------",
      "2x Nasi Gudeg             70.000",
      "   + Tambah Ayam",
      "   * tidak pedas",
      "1x Es Teh Manis            5.000",
      "--------------------------------",
      "Subtotal                  75.000",
      "Diskon 10%                -7.500",
      "Service 5%                 3.375",
      "PB1 10%                    7.088",
      "TOTAL                     77.963",
      "Tunai                    100.000",
      "Kembali                   22.037",
      "--------------------------------",
      "         Terima kasih!",
    ]);
  });

  it("shows service and PB1 as included in the price when the brand's prices include tax (ADR-030)", () => {
    const inclusive = { ...example.order, rates: { serviceBps: 500, taxBps: 1_000, includesTax: true }, serviceCharge: 2_922, tax: 6_136, total: 67_500, changeAmount: 32_500 };
    const lines = renderText(buildReceipt({ ...example, order: inclusive }), 32);

    expect(lines.slice(lines.indexOf("Diskon 10%                -7.500") + 1, lines.indexOf("Tunai                    100.000"))).toEqual([
      "TOTAL                     67.500",
      "Termasuk service 5%        2.922",
      "Termasuk PB1 10%           6.136",
    ]);
  });

  it("omits discount, service and PB1 rows when they are zero", () => {
    const lines = renderText(
      buildReceipt({ ...example, order: { ...example.order, discount: null, discountAmount: 0, rates: { serviceBps: 0, taxBps: 0 }, serviceCharge: 0, tax: 0 } }),
      32,
    );
    expect(lines.some((l) => /Diskon|Service|PB1/.test(l))).toBe(false);
  });

  it("wraps a name that does not fit next to its amount", () => {
    const long = { ...example.order, lines: [{ productName: "Nasi Goreng Kampung Spesial Pedas Level 5", quantity: 10, unitPrice: 100_000, notes: "", modifiers: [] }] };
    const lines = renderText(buildReceipt({ ...example, order: long }), 32);
    expect(lines).toContain("10x Nasi Goreng Kampung Spesial");
    expect(lines).toContain("  Pedas Level 5        1.000.000");
  });

  it("uses 48 columns on 80 mm paper", () => {
    const lines = renderText(buildReceipt(example), 48);
    expect(lines).toContain("TOTAL                                     77.963");
    expect(lines.every((l) => l.length <= 48)).toBe(true);
  });

  it("marks a voided order", () => {
    expect(renderText(buildReceipt({ ...example, order: { ...example.order, status: "voided" } }), 32)).toContain("           ** VOID **");
  });
});

describe("receipt — dine-in and line discounts (Fase 4)", () => {
  const dineIn: ReceiptInput = {
    ...example,
    order: {
      ...example.order,
      tableLabel: "A1",
      lines: [
        { productName: "Kopi Susu", quantity: 3, unitPrice: 18_000, notes: "", modifiers: [], discount: { type: "fixed", value: 18_000 }, promotion: { id: "Q1", name: "Beli 2 gratis 1" } },
        { productName: "Es Teh Manis", quantity: 1, unitPrice: 5_000, notes: "", modifiers: [], discount: { type: "percentage", value: 10 }, promotion: null },
      ],
      discount: null,
      rates: { serviceBps: 0, taxBps: 0 },
      subtotal: 59_000,
      discountAmount: 18_500,
      serviceCharge: 0,
      tax: 0,
      total: 40_500,
      changeAmount: 0,
    },
    payments: [{ methodName: "QRIS", amount: 40_500 }],
  };

  it("shows the table and each line's promotion or discount under it", () => {
    const text = renderText(buildReceipt(dineIn), 32);

    expect(text).toContain("Meja : A1");
    expect(text.slice(text.indexOf("3x Kopi Susu              54.000"), text.indexOf("Subtotal                  59.000"))).toEqual([
      "3x Kopi Susu              54.000",
      "   Beli 2 gratis 1       -18.000",
      "1x Es Teh Manis            5.000",
      "   Diskon 10%               -500",
      "--------------------------------",
    ]);
  });

  it("does not repeat line discounts in the order discount row", () => {
    const text = renderText(buildReceipt(dineIn), 32);

    expect(text.filter((l) => l.startsWith("Diskon"))).toEqual([]);
  });

  it("prints the delivery app and its order number big, so the driver finds the order (ADR-029)", () => {
    const lines = renderText(buildReceipt({ ...example, order: { ...example.order, channelName: "GoFood", externalRef: "GF-881234" } }), 32);

    expect(lines.slice(3, 5)).toEqual(["       GOFOOD #GF-881234", "No   : JKT01A-260925-0042"]);
  });
});
