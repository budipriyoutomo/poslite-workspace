"use client";

import { BarChart3, Clock, History, Lock, ReceiptText, RefreshCw, ShoppingCart, Store, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { authCopy, useIdleLock, useSession, useSessionHydrated } from "@/features/auth";
import { getOpenShift, useOpenShift } from "@/features/shift";
import { SyncBadge } from "@/features/sync";
import { useOnlineStatus } from "@/shared/hooks";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/utils";

const NAV = [
  { href: "/sell", label: "Jual", icon: ShoppingCart },
  { href: "/bills", label: "Bill", icon: ReceiptText },
  { href: "/orders", label: "Riwayat", icon: History },
  { href: "/shift", label: "Shift", icon: Clock },
  { href: "/reports", label: "Laporan", icon: BarChart3 },
  { href: "/sync", label: "Sync", icon: RefreshCw },
] as const;

// Selling needs an open shift (06-domain-and-database.md, Shift rule 2); history and reports don't.
const NEEDS_SHIFT = ["/sell", "/checkout"];

/** Route guard + header for every POS screen (02-frontend-architecture.md "Routing Guard"). */
export function PosShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, lock } = useSession();
  const isHydrated = useSessionHydrated();
  const liveShiftId = useOpenShift()?.id ?? null;
  const isOnline = useOnlineStatus();
  // Read the shift straight from IndexedDB on every route or shift change: a live query can still
  // hold the pre-write value right after "Buka Shift" navigates here, which would bounce the cashier.
  const [shiftCheck, setShiftCheck] = useState<{ path: string; isAllowed: boolean } | null>(null);

  useIdleLock();
  useEffect(() => {
    let isCurrent = true;
    void getOpenShift().then((shift) => {
      if (isCurrent) setShiftCheck({ path: pathname, isAllowed: Boolean(shift) || !NEEDS_SHIFT.includes(pathname) });
    });
    return () => {
      isCurrent = false;
    };
  }, [pathname, liveShiftId]);

  const isChecked = shiftCheck?.path === pathname;
  useEffect(() => {
    if (!isHydrated) return;
    if (!user) router.replace("/lock");
    else if (isChecked && !shiftCheck.isAllowed) router.replace("/shift");
  }, [isHydrated, user, isChecked, shiftCheck, router]);

  if (!isHydrated || !user || !isChecked || !shiftCheck.isAllowed) return null;

  return (
    <div className="flex h-dvh flex-col bg-slate-50">
      <header className="flex items-center gap-2 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 px-3 py-2 text-white shadow-md lg:gap-3 lg:px-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 shadow-sm shadow-emerald-500/30">
          <Store className="size-4" />
        </span>
        <span className="hidden font-bold tracking-tight sm:inline">POSLite</span>
        <nav className="ml-1 flex gap-0.5 rounded-xl bg-white/5 p-1 lg:ml-3 lg:gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors lg:px-3",
                  active ? "bg-emerald-500 font-semibold text-white shadow-sm shadow-emerald-900/40" : "text-slate-300 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon aria-hidden className="hidden size-4 xl:block" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 lg:gap-3">
          <SyncBadge />
          <Badge variant="outline" className={cn("gap-1 border-transparent", isOnline ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300")}>
            {isOnline ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {isOnline ? "Online" : "Offline"}
          </Badge>
          <span className="hidden items-center gap-2 text-sm text-slate-300 lg:flex">
            <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
            <span>{user.name}</span>
          </span>
          <Button size="sm" variant="secondary" onClick={lock}>
            <Lock /> {authCopy.lock}
          </Button>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
