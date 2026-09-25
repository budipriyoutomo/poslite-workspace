"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb } from "@/shared/db";

/** Outlet profile and rates of this device (undefined while loading or before activation). */
export function useOutletSetting() {
  return useLiveQuery(async () => (await getDb().settings.get("outlet"))?.value, []);
}
