"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";

import { useIdleLock, useSession, useSessionHydrated } from "@/features/auth";
import { getOpenShift, useOpenShift } from "@/features/shift";
import { useOnlineStatus } from "@/shared/hooks";

import { PosHeader } from "./pos-header";
import { PosNav } from "./pos-nav";

// Selling needs an open shift (06-domain-and-database.md, Shift rule 2); history and reports don't.
const NEEDS_SHIFT = ["/sell", "/checkout"];

/** Route guard + header and navigation for every POS screen (02-frontend-architecture.md "Routing Guard"). */
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
    // The dark backdrop fills the notch and side insets so they blend with the header.
    <div className="flex h-dvh flex-col bg-slate-950 pt-safe px-safe">
      <PosHeader cashierName={user.name} isOnline={isOnline} onLock={lock} />
      <div className="flex min-h-0 flex-1 flex-col bg-background md:flex-row">
        <PosNav pathname={pathname} />
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto md:pb-safe">{children}</main>
      </div>
    </div>
  );
}
