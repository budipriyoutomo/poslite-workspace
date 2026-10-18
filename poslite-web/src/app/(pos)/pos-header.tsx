"use client";

import { Lock, Store, WifiOff } from "lucide-react";

import { authCopy } from "@/features/auth";
import { SyncBadge } from "@/features/sync";
import { Button } from "@/shared/ui/button";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { cn } from "@/shared/ui/utils";

type Props = { cashierName: string; isOnline: boolean; onLock: () => void };

/** Compact POS top bar: brand, connection and sync state, theme, cashier and lock; an offline banner below it. */
export function PosHeader({ cashierName, isOnline, onLock }: Props) {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 px-3 text-white shadow-md lg:px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 shadow-sm shadow-emerald-500/30">
          <Store className="size-4" />
        </span>
        <span className="hidden font-bold tracking-tight sm:inline">POSLite</span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <SyncBadge />
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
              isOnline ? "text-emerald-300 sm:bg-emerald-500/15" : "bg-red-500/20 text-red-200",
            )}
          >
            {isOnline ? <span aria-hidden className="size-2 rounded-full bg-emerald-400 shadow-[0_0_0_3px] shadow-emerald-400/20" /> : <WifiOff aria-hidden className="size-3" />}
            {/* Online is the normal state, so phones show just the dot; Offline always reads out. */}
            <span className={cn(isOnline && "max-sm:sr-only")}>{isOnline ? "Online" : "Offline"}</span>
          </span>
          <ThemeToggle className="text-slate-300 hover:bg-white/10 hover:text-white dark:hover:bg-white/10" />
          {/* Who is on the till stays visible on every screen size. */}
          <span className="flex min-w-0 items-center gap-2 text-sm text-slate-300">
            <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {cashierName.trim().charAt(0).toUpperCase()}
            </span>
            <span className="max-w-24 truncate sm:max-w-40">{cashierName}</span>
          </span>
          <Button size="sm" variant="secondary" onClick={onLock}>
            <Lock /> <span className="max-sm:sr-only">{authCopy.lock}</span>
          </Button>
        </div>
      </header>
      {!isOnline && (
        <p role="status" className="flex shrink-0 items-center gap-2 bg-warning px-3 py-1.5 text-xs font-medium text-warning-foreground lg:px-4">
          <WifiOff aria-hidden className="size-3.5 shrink-0" />
          Sedang offline. Transaksi tetap tersimpan di perangkat dan dikirim otomatis saat online.
        </p>
      )}
    </>
  );
}
