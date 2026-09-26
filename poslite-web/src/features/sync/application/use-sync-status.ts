"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb, readState } from "@/shared/db";

import { useSyncRuntime } from "./sync-runner";

/** Counts for the header badge and the Sync screen (03-offline-sync.md "UX Offline"). */
export function useSyncStatus() {
  const runtime = useSyncRuntime();
  const counts = useLiveQuery(async () => {
    const db = getDb();
    const byStatus = async (status: string) => db.outbox.where("[status+seq]").between([status, -Infinity], [status, Infinity]).count();
    return {
      pending: (await byStatus("pending")) + (await byStatus("failed")) + (await byStatus("sending")),
      dead: await byStatus("dead"),
      lastSyncAt: (await readState(db, "lastSyncAt")) ?? null,
      mode: (await readState(db, "device"))?.mode ?? null,
    };
  }, []);
  return counts && { ...counts, ...runtime };
}

export function useDeadEvents() {
  return useLiveQuery(() => getDb().outbox.where("[status+seq]").between(["dead", -Infinity], ["dead", Infinity]).toArray(), []);
}
