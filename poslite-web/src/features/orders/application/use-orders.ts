"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb } from "@/shared/db";

/** Latest orders on this device, newest first (indexed by createdAt — Fase 0 Dexie spike). */
export function useRecentOrders(limit = 50) {
  return useLiveQuery(() => getDb().orders.orderBy("createdAt").reverse().limit(limit).toArray(), [limit]);
}

export function useOrderDetail(orderId: string | null) {
  return useLiveQuery(async () => {
    if (!orderId) return null;
    const db = getDb();
    const order = await db.orders.get(orderId);
    return order ? { order, payments: await db.payments.where("orderId").equals(orderId).toArray() } : null;
  }, [orderId]);
}
