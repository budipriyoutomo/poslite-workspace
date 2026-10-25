"use client";

import { Lock, Store, WifiOff } from "lucide-react";

import { authCopy, DemoBanner } from "@/features/auth";
import { SyncStatus } from "@/features/sync";
import { useOutletSetting } from "@/shared/hooks";
import { Button } from "@/shared/ui/button";
import { ThemeToggle } from "@/shared/ui/theme-toggle";

type Props = { cashierName: string; isOnline: boolean; onLock: () => void };

/** "Sushi Maru · Outlet Dago · Perangkat A": which till this is, for multi-brand groups (ADR-022). */
function useTillName(): string | null {
  const outlet = useOutletSetting();
  if (!outlet) return null;
  return [outlet.brand?.name, outlet.outletName, `Perangkat ${outlet.deviceCode}`].filter(Boolean).join(" · ");
}

/**
 * Compact POS top bar: brand and till, sync state, theme, cashier and lock (15 · UX-01). A demo
 * banner above it on a demo device, and an offline banner below it.
 */
export function PosHeader({ cashierName, isOnline, onLock }: Props) {
  const tillName = useTillName();
  return (
    <>
      <DemoBanner />
      <header className="flex h-14 shrink-0 items-center gap-2 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 px-3 text-white shadow-md lg:px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 shadow-sm shadow-emerald-500/30">
          <Store className="size-4" />
        </span>
        <span className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className="font-bold tracking-tight">POSLite</span>
          {tillName && <span className="truncate text-xs text-slate-400">{tillName}</span>}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <SyncStatus isOnline={isOnline} />
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
