"use client";

import { getDb } from "@/shared/db";

import { resendDead } from "../application/sync-engine";
import { kickSync } from "../application/sync-runner";
import { useSyncIndicator } from "../application/use-sync-indicator";
import { SyncStatusBadge } from "./SyncStatusBadge";

/** Header sync badge wired to the outbox; Kirim ulang requeues failed events and syncs now. */
export function SyncStatus({ isOnline }: { isOnline: boolean }) {
  const status = useSyncIndicator(isOnline);
  if (!status) return null;
  const resend = async () => {
    await resendDead(getDb());
    kickSync();
  };
  return <SyncStatusBadge {...status} onResend={() => void resend()} />;
}
