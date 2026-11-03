"use client";

import { PrinterX, RotateCw } from "lucide-react";
import { useState } from "react";

import { getDb, type PosDb } from "@/shared/db";
import { Button } from "@/shared/ui/button";

import { usePrinterStatuses } from "../application/use-printer-statuses";
import { copy } from "../copy";

const STATIONS = ["kitchen", "bar"] as const;
type Station = (typeof STATIONS)[number];

/**
 * A small banner on the sell screen while a kitchen or bar printer is unreachable (15 · UX-08):
 * the kitchen is not getting the orders, so the cashier has to know. The receipt has its own message.
 */
export function StationAlert({ db = getDb(), onRetry }: { db?: PosDb; onRetry: (station: Station) => Promise<void> | void }) {
  const statuses = usePrinterStatuses(db);
  const [isRetrying, setIsRetrying] = useState(false);
  const down = statuses && STATIONS.find((s) => statuses[s].status.state === "unreachable");
  if (!statuses || !down) return null;
  const status = statuses[down].status;
  const retry = async () => {
    setIsRetrying(true);
    try {
      await onRetry(down);
    } finally {
      setIsRetrying(false);
    }
  };
  return (
    <div role="alert" className="flex shrink-0 items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive">
      <PrinterX aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{copy.stationDown(down, status.state === "unreachable" ? status.waiting : 0)}</span>
      <Button size="sm" variant="outline" className="h-7 border-destructive/40 bg-transparent text-destructive" disabled={isRetrying} onClick={() => void retry()}>
        <RotateCw /> {copy.retry}
      </Button>
    </div>
  );
}
