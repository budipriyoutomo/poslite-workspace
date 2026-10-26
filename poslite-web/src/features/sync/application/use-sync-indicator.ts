"use client";

import { useMinuteClock } from "@/shared/hooks";

import { syncIndicator } from "../domain/sync-indicator";
import { useSyncStatus } from "./use-sync-status";

/** The header badge state (15 · UX-01); undefined while loading or on a device not set up yet. */
export function useSyncIndicator(isOnline: boolean) {
  const status = useSyncStatus();
  const now = useMinuteClock();
  if (!status?.mode) return undefined;
  const { pending, dead, lastSyncAt, mode } = status;
  return { indicator: syncIndicator({ mode, isOnline, pending, dead, lastSyncAt, now }), pending, dead, lastSyncAt };
}
