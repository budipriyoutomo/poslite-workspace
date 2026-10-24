"use client";

import { BadgePercent, Ban, BarChart3, Building2, CalendarCheck, CreditCard, LogOut, Menu, MonitorSmartphone, Receipt, Store, Tags, UtensilsCrossed, Users, Webhook } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import { AuthGate, BrandSelect, usePageAccess, useSessionStore } from "@/features/auth";
import { OutletSelect } from "@/features/outlets";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/utils";

// `needs`: company pages are for company-wide users; menu and promotions for users who manage
// the active brand (ADR-022). The API enforces the same rules.
const NAV = [
  { href: "/", label: "Dashboard", icon: BarChart3, needs: null, group: "Operasional" },
  { href: "/day-closing", label: "Tutup Hari", icon: CalendarCheck, needs: null, group: "Operasional" },
  { href: "/bill-voids", label: "Batal Sebelum Bayar", icon: Ban, needs: null, group: "Operasional" },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed, needs: "manageBrand", group: "Operasional" },
  { href: "/prices", label: "Harga Outlet", icon: Tags, needs: null, group: "Operasional" },
  { href: "/promotions", label: "Promo", icon: BadgePercent, needs: "manageBrand", group: "Operasional" },
  { href: "/outlets", label: "Outlet, Meja & Perangkat", icon: MonitorSmartphone, needs: null, group: "Operasional" },
  { href: "/brands", label: "Brand", icon: Building2, needs: "company", group: "Perusahaan" },
  { href: "/payment-methods", label: "Metode Bayar", icon: CreditCard, needs: "company", group: "Perusahaan" },
  { href: "/users", label: "Pengguna", icon: Users, needs: "company", group: "Perusahaan" },
  { href: "/integrations", label: "Integrasi", icon: Webhook, needs: "company", group: "Perusahaan" },
  { href: "/billing", label: "Langganan", icon: Receipt, needs: "company", group: "Perusahaan" },
] as const;

const GROUPS = ["Operasional", "Perusahaan"] as const;

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSessionStore((s) => s.session);
  const signOut = useSessionStore((s) => s.signOut);
  const access = usePageAccess();
  // Below md the sidebar is an off-canvas drawer; from md up it is always shown.
  const [navOpen, setNavOpen] = useState(false);
  const items = NAV.filter(({ needs }) => needs === null || access[needs]);
  const current = items.find(({ href }) => isActive(pathname, href));

  return (
    <AuthGate>
      <div className="flex min-h-dvh bg-background">
        {navOpen && <button type="button" aria-label="Tutup menu" className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-[2px] md:hidden" onClick={() => setNavOpen(false)} />}
        <aside
          id="app-sidebar"
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 print:hidden flex-col overflow-y-auto border-r bg-sidebar p-3 text-sidebar-foreground shadow-xl transition-transform md:sticky md:top-0 md:h-dvh md:translate-x-0 md:shadow-none",
            navOpen ? "translate-x-0" : "-translate-x-full max-md:invisible",
          )}
        >
          <div className="mb-5 flex items-center gap-3 px-2 pt-1">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm">
              <Store className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">{session?.tenant.name}</p>
              <p className="text-xs text-muted-foreground">POSLite Back-office</p>
            </div>
          </div>
          <nav className="flex flex-col gap-4">
            {GROUPS.map((group) => {
              const links = items.filter((item) => item.group === group);
              if (links.length === 0) return null;
              return (
                <div key={group} className="flex flex-col gap-0.5">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{group}</p>
                  {links.map(({ href, label, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => setNavOpen(false)}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                          active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary" />}
                        <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
          <div className="mt-auto border-t pt-3">
            <div className="mb-2 flex items-center gap-2.5 px-2">
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {initials(session?.user.name)}
              </span>
              <p className="truncate text-sm font-medium">{session?.user.name}</p>
            </div>
            <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={signOut}>
              <LogOut /> Keluar
            </Button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex print:hidden flex-wrap items-center gap-3 border-b bg-card/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/70 md:px-6">
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buka menu" aria-expanded={navOpen} aria-controls="app-sidebar" onClick={() => setNavOpen(true)}>
              <Menu />
            </Button>
            <p className="mr-auto truncate text-base font-semibold tracking-tight">{current?.label}</p>
            <BrandSelect />
            <OutletSelect />
          </header>
          <main className="min-w-0 flex-1 p-4 md:p-8 print:p-0">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}
