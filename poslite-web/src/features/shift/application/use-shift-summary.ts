"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb, type ShiftRow } from "@/shared/db";

import { summarizeShiftCash } from "../domain/shift-cash";

/** Live cash summary of a shift, recomputed whenever an order or cash movement is written. */
export function useShiftSummary(shift: ShiftRow) {
  return useLiveQuery(async () => {
    const db = getDb();
    const orders = await db.orders.where("shiftId").equals(shift.id).toArray();
    const payments = await db.payments.where("orderId").anyOf(orders.map((o) => o.id)).toArray();
    const movements = await db.cashMovements.where("shiftId").equals(shift.id).toArray();
    const refunds = await db.refunds.where("shiftId").equals(shift.id).toArray();
    return {
      ...summarizeShiftCash(
        shift.openingCash,
        orders.map((o) => ({ status: o.status, changeAmount: o.changeAmount, payments: payments.filter((p) => p.orderId === o.id) })),
        movements,
        refunds,
      ),
      paidCount: orders.filter((o) => o.status === "paid").length,
      // Shown on the close-shift summary (ADR-023).
      voids: { count: orders.filter((o) => o.status === "voided").length, total: orders.filter((o) => o.status === "voided").reduce((s, o) => s + o.total, 0) },
      refunds: { count: refunds.length, total: refunds.reduce((s, r) => s + r.total, 0) },
    };
  }, [shift.id, shift.openingCash]);
}
