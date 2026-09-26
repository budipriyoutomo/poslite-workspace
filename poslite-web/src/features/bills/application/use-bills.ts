"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb } from "@/shared/db";

/** Open bills on this device, oldest first. */
export function useOpenBills() {
  return useLiveQuery(() => getDb().openBills.orderBy("openedAt").toArray(), []);
}

export function useDiningTables() {
  return useLiveQuery(() => getDb().diningTables.orderBy("sortOrder").toArray(), []);
}
