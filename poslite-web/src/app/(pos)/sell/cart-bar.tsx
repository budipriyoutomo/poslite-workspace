"use client";

import { ChevronUp, ShoppingCart } from "lucide-react";

import { formatRupiah } from "@/shared/money";
import { cn } from "@/shared/ui/utils";

/** Phone-only bar above the bottom navigation: what is in the order, one tap to open it. */
export function CartBar({ itemCount, total, onOpen, className }: { itemCount: number; total: number; onOpen: () => void; className?: string }) {
  if (itemCount === 0) return null;
  return (
    <div className={cn("shrink-0 border-t bg-card/95 px-3 py-2 backdrop-blur", className)}>
      <button
        type="button"
        onClick={onOpen}
        className="flex h-13 w-full animate-in items-center gap-3 rounded-xl bg-primary px-4 text-primary-foreground shadow-lg transition-transform duration-200 slide-in-from-bottom-4 active:scale-[0.98]"
      >
        <span className="relative">
          <ShoppingCart aria-hidden className="size-5" />
          {/* Keyed by count so the number pops on every add. */}
          <span key={itemCount} className="absolute -top-2 -right-2.5 flex h-4.5 min-w-4.5 animate-in items-center justify-center rounded-full bg-primary-foreground px-1 text-[10px] font-bold text-primary zoom-in-50">
            {itemCount}
          </span>
        </span>
        <span className="text-left text-sm leading-tight">
          <span className="block font-semibold">Lihat pesanan</span>
          <span className="block text-xs opacity-80">{itemCount} item</span>
        </span>
        <span className="ml-auto text-base font-bold">{formatRupiah(total)}</span>
        <ChevronUp aria-hidden className="size-4 opacity-80" />
      </button>
    </div>
  );
}
