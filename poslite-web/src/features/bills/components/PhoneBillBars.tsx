"use client";

import { Armchair, ChefHat, ChevronUp } from "lucide-react";

import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";

import { copy } from "../copy";

/** The table a waiter is ordering for, pinned above the menu on a phone (15 · UX-09). */
export function ActiveTableBar({ tableLabel, canChange, onChange }: { tableLabel: string; canChange: boolean; onChange: () => void }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-warning/30 bg-warning/10 px-3 py-1.5">
      <span role="status" aria-label={copy.activeTable} className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-warning">
        <Armchair aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{copy.table(tableLabel)}</span>
      </span>
      {/* A saved bill moves on the table screen, where its kitchen tickets follow it. */}
      <Button variant="ghost" size="sm" disabled={!canChange} onClick={onChange}>
        {copy.changeTable}
      </Button>
    </div>
  );
}

interface SendBarProps {
  /** Units not on a kitchen ticket yet. */
  newCount: number;
  itemCount: number;
  subtotal: number;
  isBusy?: boolean;
  onSend: () => void;
  onOpen: () => void;
}

/** Bottom of a waiter's phone (15 · UX-09): the order at a glance, and the kitchen one thumb away. */
export function KitchenSendBar({ newCount, itemCount, subtotal, isBusy = false, onSend, onOpen }: SendBarProps) {
  const summary = copy.summary(itemCount, formatRupiah(subtotal));
  return (
    <div className="flex shrink-0 items-center gap-2 border-t bg-card/95 px-3 py-2 backdrop-blur">
      <button type="button" aria-label={`${copy.viewOrder} · ${summary}`} onClick={onOpen} className="flex min-w-0 flex-col items-start rounded-lg px-2 py-1 text-left leading-tight hover:bg-muted">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {copy.viewOrder} <ChevronUp aria-hidden className="size-3" />
        </span>
        <span className="text-sm font-bold whitespace-nowrap tabular-nums">{summary}</span>
      </button>
      <Button size="lg" className="h-12 min-w-0 flex-1 text-base" disabled={isBusy} onClick={onSend}>
        <ChefHat /> <span className="truncate">{copy.sendToKitchen(newCount)}</span>
      </Button>
    </div>
  );
}
