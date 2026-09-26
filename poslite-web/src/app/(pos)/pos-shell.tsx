"use client";

import { Lock, ShoppingCart, Wifi, WifiOff } from "lucide-react";
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
  { href: "/sell", label: "Jual" },
  { href: "/orders", label: "Riwayat" },
  { href: "/shift", label: "Shift" },
  { href: "/reports", label: "Laporan" },
  { href: "/sync", label: "Sync" },
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
      <header className="flex items-center gap-3 border-b bg-slate-900 px-4 py-2 text-white">
        <ShoppingCart className="size-5 text-emerald-400" />
        <span className="font-bold">POSLite</span>
        <nav className="ml-4 flex gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn("rounded-md px-3 py-1.5 text-sm", pathname === item.href ? "bg-white/15 font-semibold" : "text-slate-300 hover:bg-white/10")}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <SyncBadge />
          <Badge variant="outline" className={cn("gap-1 border-transparent", isOnline ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300")}>
            {isOnline ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {isOnline ? "Online" : "Offline"}
          </Badge>
          <span className="hidden text-sm text-slate-300 sm:inline">{user.name}</span>
          <Button size="sm" variant="secondary" onClick={lock}>
            <Lock /> {authCopy.lock}
          </Button>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
