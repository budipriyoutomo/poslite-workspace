"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Building2, LayoutDashboard, LogOut, Menu, ScrollText, ShieldCheck, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/utils";

import { useMe } from "../application/use-me";
import { useOperatorStore } from "../application/session-store";

const NAV = [
  { href: "/", label: "Ringkasan", icon: LayoutDashboard },
  { href: "/tenants", label: "Tenant", icon: Building2 },
  { href: "/users", label: "Cari User", icon: Users },
  { href: "/operators", label: "Operator", icon: UserCog },
  { href: "/audit", label: "Audit Log", icon: ScrollText },
] as const;

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const signOut = useOperatorStore((s) => s.signOut);
  const me = useMe();
  // Below md the sidebar is an off-canvas drawer; from md up it is always shown.
  const [navOpen, setNavOpen] = useState(false);
  const current = NAV.find(({ href }) => isActive(pathname, href));

  return (
    <div className="flex min-h-dvh bg-slate-100">
      {navOpen && <button type="button" aria-label="Tutup menu" className="fixed inset-0 z-30 bg-slate-950/50 md:hidden" onClick={() => setNavOpen(false)} />}
      <aside
        id="console-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col gap-1 overflow-y-auto bg-slate-950 p-3 text-slate-300 transition-transform md:sticky md:top-0 md:h-dvh md:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full max-md:invisible",
        )}
      >
        <div className="mb-5 flex items-center gap-3 px-2 pt-1">
          <span className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-900/40">
            <ShieldCheck className="size-5" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Konsol Operator</p>
            <p className="text-xs text-slate-500">POSLite Platform</p>
          </div>
        </div>
        <nav aria-label="Navigasi konsol" className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setNavOpen(false)}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "bg-white/10 font-semibold text-white" : "hover:bg-white/5 hover:text-white",
                )}
              >
                {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-indigo-400" />}
                <Icon className={cn("size-4", active ? "text-indigo-300" : "text-slate-500")} /> {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 border-t border-white/10 pt-3 text-sm">
          <p className="truncate px-2 text-slate-400">{me.data?.name}</p>
          <Button variant="ghost" size="sm" className="w-full justify-start text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => (signOut(), queryClient.clear())}>
            <LogOut /> Keluar
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-white/90 px-4 py-2.5 backdrop-blur md:hidden">
          <Button variant="ghost" size="icon" aria-label="Buka menu" aria-expanded={navOpen} aria-controls="console-sidebar" onClick={() => setNavOpen(true)}>
            <Menu />
          </Button>
          <span className="truncate text-sm font-semibold">{current?.label}</span>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
