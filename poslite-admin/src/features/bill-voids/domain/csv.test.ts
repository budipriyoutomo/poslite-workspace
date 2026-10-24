import { describe, expect, it } from "vitest";

import { billVoidsCsv } from "./csv";

const base = {
  id: "V1",
  outlet_id: "T1",
  device_id: "D1",
  shift_id: "S1",
  business_date: "2026-09-25",
  bill_id: "B1",
  table_label: "B1",
  cashier_id: "U1",
  cashier_name: "Siti",
  approved_by: "U2",
  approver_name: "Budi",
  voided_at: "2026-09-25T05:20:00Z", // 12:20 WIB
};

describe("billVoidsCsv (ADR-028)", () => {
  it("writes one row per void, items joined, with a BOM and ; for Indonesian Excel", () => {
    const csv = billVoidsCsv(
      [
        {
          ...base,
          scope: "bill_cancelled",
          reason: "Salah input; dobel",
          amount: 58_000,
          lines: [
            { product_id: "P1", product_name: "Nasi Gudeg", modifiers: [], unit_price: 25_000, quantity: 2, amount: 50_000 },
            { product_id: "P2", product_name: "Es Teh", modifiers: [], unit_price: 8_000, quantity: 1, amount: 8_000 },
          ],
        },
      ],
      "Asia/Jakarta",
    );

    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\n")).toEqual([
      "Waktu;Tanggal bisnis;Meja;Jenis;Item;Nilai;Alasan;Kasir;Disetujui",
      '25/09/2026 12:20;2026-09-25;B1;Bill dibatalkan;2x Nasi Gudeg, 1x Es Teh;58000;"Salah input; dobel";Siti;Budi',
    ]);
  });

  it("names the cashier as approver when a manager acted alone", () => {
    const csv = billVoidsCsv([{ ...base, approved_by: null, approver_name: null, scope: "line", reason: "Pelanggan batal", amount: 25_000, lines: [] }], "Asia/Jakarta");

    expect(csv.split("\n")[1]).toMatch(/;Kurangi item;.*;Siti;Siti$/);
  });
});
