"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb } from "@/shared/db";

import { loadReceiptLines } from "./load-receipt";

export function useReceiptLines(orderId: string | null) {
  return useLiveQuery(async () => (orderId ? ((await loadReceiptLines(getDb(), orderId)) ?? null) : null), [orderId]);
}
