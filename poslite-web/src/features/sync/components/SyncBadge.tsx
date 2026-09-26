"use client";

import { CloudAlert, RefreshCw } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/ui/utils";

import { useSyncStatus } from "../application/use-sync-status";

/** 🟡 Syncing (n) / 🔴 n gagal — links to the Sync screen. Hidden on a demo device. */
export function SyncBadge() {
  const status = useSyncStatus();
  if (!status || status.mode !== "server" || (status.pending === 0 && status.dead === 0)) return null;
  return (
    <Link href="/sync">
      <Badge variant="outline" className={cn("gap-1 border-transparent", status.dead > 0 ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-200")}>
        {status.dead > 0 ? <CloudAlert className="size-3" /> : <RefreshCw className={cn("size-3", status.isSyncing && "animate-spin")} />}
        {status.dead > 0 ? `${status.dead} gagal` : `Sync (${status.pending})`}
      </Badge>
    </Link>
  );
}
