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
    rates: { serviceBps: number; taxBps: number; includesTax?: boolean };
    /** Delivery app sale (ADR-029): printed big so the driver finds the order. */
    channelName?: string | null;
    externalRef?: string | null;
    /** Take-away/delivery queue number and the guest's name (P1-1). */
    queueNo?: string | null;
    customerName?: string | null;
    /** Cash rounding (P1-3), printed under TOTAL; may be negative. */
    rounding?: number;
    subtotal: number;
    discountAmount: number;
    serviceCharge: number;
    tax: number;
    total: number;
    changeAmount: number;
  };
  payments: { methodName: string; amount: number }[];
}

/** "GOFOOD #GF-881234": the delivery app and its order number, as the driver says them (ADR-029). */
/** "ANTRIAN A-012 Andi": what the counter calls out (P1-1). */
export function queueLabel(queueNo: string, customerName?: string | null): string {
  return `ANTRIAN ${queueNo}${customerName ? ` ${customerName}` : ""}`;
}

export function channelLabel(channelName: string | null | undefined, externalRef: string): string {
  return `${(channelName ?? "").toUpperCase()} #${externalRef}`.trim();
}

function percent(bps: number): string {
  return `${String(bps / 100).replace(".", ",")}%`;
}

/**
 * Customer receipt as laid out in 04-printing.md. Service and PB1 rows only when the rate > 0; with
 * prices that include tax (ADR-030) they follow TOTAL as "Termasuk …", since the guest pays no more.
 */
export function buildReceipt({ header, footer, timezone, order, payments }: ReceiptInput): ReceiptDocument {
  const doc: ReceiptDocument = [{ kind: "text", text: header, align: "center", bold: true }, { kind: "rule" }];
  if (order.status === "voided") doc.push({ kind: "text", text: "** VOID **", align: "center", bold: true });
  if (order.queueNo) doc.push({ kind: "text", text: queueLabel(order.queueNo, order.customerName), align: "center", bold: true });
  if (order.externalRef) doc.push({ kind: "text", text: channelLabel(order.channelName, order.externalRef), align: "center", bold: true });
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
  const included = order.rates.includesTax === true;
  const rateRows: ReceiptDocument = [];
  if (order.rates.serviceBps > 0) rateRows.push({ kind: "row", left: `${included ? "Termasuk service" : "Service"} ${percent(order.rates.serviceBps)}`, right: amount(order.serviceCharge) });
  if (order.rates.taxBps > 0) rateRows.push({ kind: "row", left: `${included ? "Termasuk PB1" : "PB1"} ${percent(order.rates.taxBps)}`, right: amount(order.tax) });
  const total: ReceiptDocument[number] = { kind: "row", left: "TOTAL", right: amount(order.total), bold: true };
  doc.push(...(included ? [total, ...rateRows] : [...rateRows, total]));
  if (order.rounding) doc.push({ kind: "row", left: "Pembulatan", right: amount(order.rounding) });
  for (const p of payments) doc.push({ kind: "row", left: p.methodName, right: amount(p.amount) });
  if (order.changeAmount > 0) doc.push({ kind: "row", left: "Kembali", right: amount(order.changeAmount) });
  doc.push({ kind: "rule" }, { kind: "text", text: footer, align: "center" });
  return doc;
}
