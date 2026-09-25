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
    lines: { productName: string; quantity: number; unitPrice: number; notes: string; modifiers: { name: string; price: number }[] }[];
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

/** Receipts show amounts without "Rp": 1.000.000, -7.500. */
function amount(value: number): string {
  const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return value < 0 ? `-${digits}` : digits;
}

function percent(bps: number): string {
  return `${String(bps / 100).replace(".", ",")}%`;
}

function dateTime(iso: string, timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Customer receipt as laid out in 04-printing.md. Service and PB1 rows only when the rate > 0. */
export function buildReceipt({ header, footer, timezone, order, payments }: ReceiptInput): ReceiptDocument {
  const doc: ReceiptDocument = [{ kind: "text", text: header, align: "center", bold: true }, { kind: "rule" }];
  if (order.status === "voided") doc.push({ kind: "text", text: "** VOID **", align: "center", bold: true });
  doc.push(
    { kind: "text", text: `No   : ${order.receiptNo}` },
    { kind: "row", left: `Kasir: ${order.cashierName}`, right: dateTime(order.createdAt, timezone) },
    { kind: "rule" },
  );
  for (const line of order.lines) {
    const unit = line.unitPrice + line.modifiers.reduce((s, m) => s + m.price, 0);
    doc.push({ kind: "row", left: `${line.quantity}x ${line.productName}`, right: amount(unit * line.quantity) });
    for (const m of line.modifiers) doc.push({ kind: "text", text: `   + ${m.name}` });
    if (line.notes) doc.push({ kind: "text", text: `   * ${line.notes}` });
  }
  doc.push({ kind: "rule" }, { kind: "row", left: "Subtotal", right: amount(order.subtotal) });
  if (order.discountAmount > 0) {
    const label = order.discount?.type === "percentage" ? `Diskon ${order.discount.value}%` : "Diskon";
    doc.push({ kind: "row", left: label, right: amount(-order.discountAmount) });
  }
  if (order.rates.serviceBps > 0) doc.push({ kind: "row", left: `Service ${percent(order.rates.serviceBps)}`, right: amount(order.serviceCharge) });
  if (order.rates.taxBps > 0) doc.push({ kind: "row", left: `PB1 ${percent(order.rates.taxBps)}`, right: amount(order.tax) });
  doc.push({ kind: "row", left: "TOTAL", right: amount(order.total), bold: true });
  for (const p of payments) doc.push({ kind: "row", left: p.methodName, right: amount(p.amount) });
  if (order.changeAmount > 0) doc.push({ kind: "row", left: "Kembali", right: amount(order.changeAmount) });
  doc.push({ kind: "rule" }, { kind: "text", text: footer, align: "center" });
  return doc;
}
