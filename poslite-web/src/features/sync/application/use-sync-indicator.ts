"use client";

import { useEffect, useState } from "react";

import { syncIndicator } from "../domain/sync-indicator";
import { useSyncStatus } from "./use-sync-status";

/** Re-reads the clock every minute so "n mnt lalu" and the 2-hour stale rule stay current. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The header badge state (15 · UX-01); undefined while loading or on a device not set up yet. */
export function useSyncIndicator(isOnline: boolean) {
  const status = useSyncStatus();
  const now = useMinuteClock();
  if (!status?.mode) return undefined;
  const { pending, dead, lastSyncAt, mode } = status;
  return { indicator: syncIndicator({ mode, isOnline, pending, dead, lastSyncAt, now }), pending, dead, lastSyncAt };
}
