"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb, readState } from "@/shared/db";

/** undefined while loading, null on a device that was never activated nor put in demo mode. */
export function useDeviceState() {
  return useLiveQuery(async () => (await readState(getDb(), "device")) ?? null, []);
}
