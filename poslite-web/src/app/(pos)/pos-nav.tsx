"use client";

import { BarChart3, Clock, History, type LucideIcon, Menu, Printer, ReceiptText, RefreshCw, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { cn } from "@/shared/ui/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

// The four screens a cashier switches between all shift; the rest sit behind "Lainnya" on phones.
const PRIMARY: NavItem[] = [
  { href: "/sell", label: "Jual", icon: ShoppingCart },
  { href: "/bills", label: "Bill", icon: ReceiptText },
  { href: "/orders", label: "Riwayat", icon: History },
  { href: "/shift", label: "Shift", icon: Clock },
];
const SECONDARY: NavItem[] = [
  { href: "/reports", label: "Laporan", icon: BarChart3 },
  { href: "/sync", label: "Sync", icon: RefreshCw },
  { href: "/printer", label: "Printer", icon: Printer },
];

const itemClass = (isActive: boolean) =>
  cn(
    // Phone: a bottom-bar tab. Tablet: a rail tile with a caption. Desktop: icon and label in a row.
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
    "md:min-h-0 md:flex-none md:rounded-xl md:py-2.5 md:hover:bg-muted",
    "xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-sm",
    isActive && "text-accent-foreground md:bg-accent md:hover:bg-accent",
  );

function ItemIcon({ icon: Icon, isActive }: { icon: LucideIcon; isActive: boolean }) {
  return (
    <span className={cn("flex items-center justify-center rounded-full px-4 py-1 transition-colors md:p-0", isActive && "bg-accent max-md:text-primary md:bg-transparent")}>
      <Icon aria-hidden className="size-5" />
    </span>
  );
}

function NavLink({ item, pathname, className, onClick }: { item: NavItem; pathname: string; className?: string; onClick?: () => void }) {
  const isActive = pathname === item.href;
  return (
    <Link href={item.href} aria-current={isActive ? "page" : undefined} className={cn(itemClass(isActive), className)} onClick={onClick}>
      <ItemIcon icon={item.icon} isActive={isActive} />
      {item.label}
    </Link>
  );
}

/** POS navigation: bottom tab bar on phones, a side rail on tablets and desktops. */
export function PosNav({ pathname }: { pathname: string }) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isSecondaryActive = SECONDARY.some((item) => item.href === pathname);

  return (
    <nav
      aria-label="Menu utama"
      className="order-last flex shrink-0 border-t bg-card px-1 pb-safe md:order-first md:w-20 md:flex-col md:gap-1 md:border-t-0 md:border-r md:p-2 xl:w-52"
    >
      {PRIMARY.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
      <div className="hidden md:mt-auto md:flex md:flex-col md:gap-1 md:border-t md:pt-2">
        {SECONDARY.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-current={isSecondaryActive ? "page" : undefined}
        className={cn(itemClass(isSecondaryActive), "md:hidden")}
        onClick={() => setIsMoreOpen(true)}
      >
        <ItemIcon icon={Menu} isActive={isSecondaryActive} />
        Lainnya
      </button>
      <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
        <SheetContent side="bottom" aria-describedby={undefined} className="rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SheetHeader className="p-0">
            <SheetTitle>Menu lainnya</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2">
            {SECONDARY.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} className="min-h-20 rounded-xl border text-xs" onClick={() => setIsMoreOpen(false)} />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
