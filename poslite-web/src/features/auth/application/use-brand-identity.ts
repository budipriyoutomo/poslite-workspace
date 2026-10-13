"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb, readState } from "@/shared/db";

import { brandIdentity } from "./brand-identity";

/** The outlet's brand for the lock screen; works offline (settings and logo are on the device). */
export function useBrandIdentity() {
  return useLiveQuery(async () => {
    const db = getDb();
    const [outlet, mediaBaseUrl] = await Promise.all([db.settings.get("outlet"), readState(db, "mediaBaseUrl")]);
    return brandIdentity(outlet?.value.brand, mediaBaseUrl ?? null);
  }, []);
}
