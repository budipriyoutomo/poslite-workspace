import { discountAmount } from "@/shared/money";

import { amount, dateTime } from "./format";
import type { ReceiptDocument } from "./receipt-document";

export interface ReceiptInput {
  header: string;
  footer: string;
  timezone: string;
  order: {
    receiptNo: string;
    cashierName: string;
    createdAt: string;
    status: "paid" | "voided";
    tableLabel?: string | null;
    lines: {
      productName: string;
      quantity: number;
      unitPrice: number;
      notes: string;
      modifiers: { name: string; price: number }[];
      discount?: { type: "percentage" | "fixed"; value: number } | null;
      promotion?: { id: string; name: string } | null;
    }[];
    discount: { type: "percentage" | "fixed"; value: number } | null;
    rates: { serviceBps: number; taxBps: number };
    subtotal: number;
    discountAmount: number;
    serviceCharge: number;
    tax: number;
    total: number;
    changeAmount: number;
  };
  payments: { methodName: string; amount: number }[];
}

function percent(bps: number): string {
  return `${String(bps / 100).replace(".", ",")}%`;
}

/** Customer receipt as laid out in 04-printing.md. Service and PB1 rows only when the rate > 0. */
export function buildReceipt({ header, footer, timezone, order, payments }: ReceiptInput): ReceiptDocument {
  const doc: ReceiptDocument = [{ kind: "text", text: header, align: "center", bold: true }, { kind: "rule" }];
  if (order.status === "voided") doc.push({ kind: "text", text: "** VOID **", align: "center", bold: true });
  doc.push(
    { kind: "text", text: `No   : ${order.receiptNo}` },
    { kind: "row", left: `Kasir: ${order.cashierName}`, right: dateTime(order.createdAt, timezone) },
  );
  if (order.tableLabel) doc.push({ kind: "text", text: `Meja : ${order.tableLabel}` });
  doc.push({ kind: "rule" });
  let itemDiscounts = 0;
  for (const line of order.lines) {
    const unit = line.unitPrice + line.modifiers.reduce((s, m) => s + m.price, 0);
    doc.push({ kind: "row", left: `${line.quantity}x ${line.productName}`, right: amount(unit * line.quantity) });
    for (const m of line.modifiers) doc.push({ kind: "text", text: `   + ${m.name}` });
    if (line.notes) doc.push({ kind: "text", text: `   * ${line.notes}` });
    const off = discountAmount(unit * line.quantity, line.discount);
    if (off > 0) {
      const label = line.promotion?.name ?? (line.discount?.type === "percentage" ? `Diskon ${line.discount.value}%` : "Diskon");
      doc.push({ kind: "row", left: `   ${label}`, right: amount(-off) });
      itemDiscounts += off;
    }
  }
  doc.push({ kind: "rule" }, { kind: "row", left: "Subtotal", right: amount(order.subtotal) });
  const orderDiscount = order.discountAmount - itemDiscounts; // line discounts are shown under their lines
  if (orderDiscount > 0) {
    const label = order.discount?.type === "percentage" ? `Diskon ${order.discount.value}%` : "Diskon";
    doc.push({ kind: "row", left: label, right: amount(-orderDiscount) });
  }
  if (order.rates.serviceBps > 0) doc.push({ kind: "row", left: `Service ${percent(order.rates.serviceBps)}`, right: amount(order.serviceCharge) });
  if (order.rates.taxBps > 0) doc.push({ kind: "row", left: `PB1 ${percent(order.rates.taxBps)}`, right: amount(order.tax) });
  doc.push({ kind: "row", left: "TOTAL", right: amount(order.total), bold: true });
  for (const p of payments) doc.push({ kind: "row", left: p.methodName, right: amount(p.amount) });
  if (order.changeAmount > 0) doc.push({ kind: "row", left: "Kembali", right: amount(order.changeAmount) });
  doc.push({ kind: "rule" }, { kind: "text", text: footer, align: "center" });
  return doc;
}
