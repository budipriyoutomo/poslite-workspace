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
    return summarizeShiftCash(
      shift.openingCash,
      orders.map((o) => ({ status: o.status, changeAmount: o.changeAmount, payments: payments.filter((p) => p.orderId === o.id) })),
      movements,
    );
  }, [shift.id, shift.openingCash]);
}
