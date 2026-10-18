import type { PosDb } from "@/shared/db";

import { buildReceipt } from "../domain/receipt-builder";
import type { ReceiptDocument } from "../domain/receipt-document";
import { renderText } from "../domain/text-layout";

export const RECEIPT_COLUMNS = { 58: 32, 80: 48 } as const;

/** An order's receipt and the column count of the receipt printer's paper (58 mm by default). */
export async function loadReceipt(db: PosDb, orderId: string): Promise<{ doc: ReceiptDocument; columns: number } | undefined> {
  const [order, payments, outlet, printer] = await Promise.all([
    db.orders.get(orderId),
    db.payments.where("orderId").equals(orderId).toArray(),
    db.settings.get("outlet"),
    db.printers.where("role").equals("receipt").first(),
  ]);
  if (!order || !outlet) return undefined;
  const doc = buildReceipt({
    // With no receipt text set for the outlet or its brand, the brand name heads the receipt.
    header: outlet.value.receiptHeader || (outlet.value.brand?.name ?? ""),
    footer: outlet.value.receiptFooter,
    timezone: outlet.value.timezone,
    order,
    payments: payments.map((p) => ({ methodName: p.methodName, amount: p.amount })),
  });
  return { doc, columns: RECEIPT_COLUMNS[printer?.paperWidth ?? 58] };
}

/** Receipt text for an order, laid out exactly as the printer gets it. */
export async function loadReceiptLines(db: PosDb, orderId: string): Promise<string[] | undefined> {
  const receipt = await loadReceipt(db, orderId);
  return receipt && renderText(receipt.doc, receipt.columns);
}
