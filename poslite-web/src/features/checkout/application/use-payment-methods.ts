"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb } from "@/shared/db";

export function usePaymentMethods() {
  return useLiveQuery(() => getDb().paymentMethods.orderBy("sortOrder").toArray(), []);
}
