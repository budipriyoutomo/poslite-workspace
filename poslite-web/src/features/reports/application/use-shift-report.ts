"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb } from "@/shared/db";

import { summarizeSales } from "../domain/sales-summary";

/** Report of the open shift, or the most recent shift when none is open. */
export function useShiftReport() {
  return useLiveQuery(async () => {
    const db = getDb();
    const shift = (await db.shifts.where("status").equals("open").first()) ?? (await db.shifts.orderBy("openedAt").last());
    if (!shift) return null;
    const orders = await db.orders.where("shiftId").equals(shift.id).toArray();
    const payments = await db.payments.where("orderId").anyOf(orders.map((o) => o.id)).toArray();
    const summary = summarizeSales(
      orders.map((o) => ({
        ...o,
        lines: o.lines.map((l) => ({
          productName: l.productName,
          categoryName: l.categoryName,
          quantity: l.quantity,
          lineTotal: (l.unitPrice + l.modifiers.reduce((s, m) => s + m.price, 0)) * l.quantity,
        })),
        payments: payments.filter((p) => p.orderId === o.id),
      })),
    );
    return { shift, summary };
  }, []);
}
