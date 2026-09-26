"use client";

import { BadgePercent, BarChart3, CreditCard, LogOut, MonitorSmartphone, Store, Tags, UtensilsCrossed, Users, Webhook } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AuthGate, useSessionStore } from "@/features/auth";
import { OutletSelect } from "@/features/outlets";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/prices", label: "Harga Outlet", icon: Tags },
  { href: "/promotions", label: "Promo", icon: BadgePercent },
  { href: "/payment-methods", label: "Metode Bayar", icon: CreditCard },
  { href: "/users", label: "Pengguna", icon: Users },
  { href: "/integrations", label: "Integrasi", icon: Webhook },
  { href: "/outlets", label: "Outlet, Meja & Perangkat", icon: MonitorSmartphone },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSessionStore((s) => s.session);
  const signOut = useSessionStore((s) => s.signOut);
  return (
    <AuthGate>
      <div className="flex min-h-dvh">
        <aside className="flex w-60 shrink-0 flex-col gap-1 border-r bg-white p-3">
          <div className="mb-4 flex items-center gap-2 px-2 py-1">
            <Store className="size-5 text-emerald-600" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{session?.tenant.name}</p>
              <p className="text-xs text-muted-foreground">POSLite Back-office</p>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn("flex items-center gap-2 rounded-md px-3 py-2 text-sm", pathname === href ? "bg-emerald-50 font-semibold text-emerald-800" : "hover:bg-slate-100")}
              >
                <Icon className="size-4" /> {label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-2 border-t pt-3 text-sm">
            <p className="px-2 text-muted-foreground">{session?.user.name}</p>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
              <LogOut /> Keluar
            </Button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-end gap-3 border-b bg-white px-6 py-3">
            <OutletSelect />
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </AuthGate>
  );
}
