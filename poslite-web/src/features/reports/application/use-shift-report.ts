"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { orderTypes } from "@/features/checkout";
import { getDb } from "@/shared/db";

import { summarizeSales } from "../domain/sales-summary";

// Orders from before sales channels (ADR-029) are reported under their order type.
const orderTypeLabel = Object.fromEntries(orderTypes([]).map((t) => [t.value, t.label]));

/** Report of the open shift, or the most recent shift when none is open. */
export function useShiftReport() {
  return useLiveQuery(async () => {
    const db = getDb();
    const shift = (await db.shifts.where("status").equals("open").first()) ?? (await db.shifts.orderBy("openedAt").last());
    if (!shift) return null;
    const orders = await db.orders.where("shiftId").equals(shift.id).toArray();
    const payments = await db.payments.where("orderId").anyOf(orders.map((o) => o.id)).toArray();
    const billVoids = await db.billVoids.where("shiftId").equals(shift.id).toArray();
    const summary = summarizeSales(
      orders.map((o) => ({
        ...o,
        channelName: o.channelName ?? orderTypeLabel[o.orderType] ?? o.orderType,
        lines: o.lines.map((l) => ({
          productName: l.productName,
          categoryName: l.categoryName,
          quantity: l.quantity,
          lineTotal: (l.unitPrice + l.modifiers.reduce((s, m) => s + m.price, 0)) * l.quantity,
        })),
        payments: payments.filter((p) => p.orderId === o.id),
      })),
    );
    // Counted like the server's pre_payment_void_count: one per bill.item_voided (ADR-028).
    const prePaymentVoids = { count: billVoids.length, amount: billVoids.reduce((s, v) => s + v.amount, 0) };
    return { shift, summary, prePaymentVoids };
  }, []);
}
