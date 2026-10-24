// CSV of pre-payment voids (ADR-028), built in the browser from the report the page already has.

export interface BillVoidRow {
  business_date: string;
  table_label: string;
  scope: "line" | "bill_cancelled";
  cashier_name: string;
  approver_name: string | null;
  reason: string;
  amount: number;
  voided_at: string;
  lines: { product_name: string; quantity: number }[];
}

export const SCOPE_LABEL: Record<BillVoidRow["scope"], string> = { line: "Kurangi item", bill_cancelled: "Bill dibatalkan" };

const HEADERS = ["Waktu", "Tanggal bisnis", "Meja", "Jenis", "Item", "Nilai", "Alasan", "Kasir", "Disetujui"];

/** A manager acting alone approves their own void (approved_by is null, ADR-023). */
export const approverOf = (v: BillVoidRow) => v.approver_name ?? v.cashier_name;

export const itemsOf = (v: BillVoidRow) => v.lines.map((l) => `${l.quantity}x ${l.product_name}`).join(", ");

export function voidTime(at: string, timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(at))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const cell = (value: string | number) => {
  const text = String(value);
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** `;` separator and a UTF-8 BOM, like the server's sales export, so Indonesian-locale Excel opens it. */
export function billVoidsCsv<V extends BillVoidRow>(voids: V[], timeZone: string): string {
  const rows = voids.map((v) => [voidTime(v.voided_at, timeZone), v.business_date, v.table_label, SCOPE_LABEL[v.scope], itemsOf(v), v.amount, v.reason, v.cashier_name, approverOf(v)]);
  return "﻿" + [HEADERS, ...rows].map((r) => r.map(cell).join(";")).join("\n");
}
