"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb, readState } from "@/shared/db";

import { orderForLockScreen } from "../domain/recent-logins";

/**
 * Users allowed on this device (pulled from the server, or the demo cashiers in demo mode): recent
 * logins first, then by name; `lastUserId` is who the lock screen opens on.
 */
export function useLockScreenUsers() {
  return useLiveQuery(async () => {
    const db = getDb();
    const recent = (await readState(db, "recentLogins")) ?? [];
    return { users: orderForLockScreen(await db.users.toArray(), recent), lastUserId: recent[0] };
  }, []);
}
