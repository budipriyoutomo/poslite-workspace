"use client";

import { Minus, Plus } from "lucide-react";

import type { ProductRow } from "@/shared/db";
import { formatRupiah } from "@/shared/money";
import { cn } from "@/shared/ui/utils";

import { copy } from "../copy";
import type { Tone } from "../domain/menu-tile";
import { STRIP, tap } from "./tile";

interface Props {
  product: ProductRow;
  tone: Tone;
  quantity: number;
  /** Has modifiers: every + opens the choices, so the item never gets a stepper. */
  hasChoices: boolean;
  onSelect: (p: ProductRow) => void;
  onDecrease?: (p: ProductRow) => void;
}

const roundButton = "flex size-11 shrink-0 items-center justify-center rounded-full transition active:scale-95";

/** One menu item per row for a waiter's phone (15 · UX-09): thumb-sized + on the right, then a stepper. */
export function ProductListRow({ product: p, tone, quantity, hasChoices, onSelect, onDecrease }: Props) {
  const hasStepper = quantity > 0 && !hasChoices && onDecrease !== undefined;
  return (
    <div className={cn("relative flex min-h-14 items-center gap-3 py-1.5 pr-2 pl-4", !p.isAvailable && "bg-muted opacity-60")}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", STRIP[tone])} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 text-sm font-semibold">{p.name}</span>
        <span className="flex items-center gap-2 text-sm">
          <span className={cn("font-bold", p.isAvailable ? "text-primary" : "text-muted-foreground")}>{p.isAvailable ? formatRupiah(p.price) : copy.unavailable}</span>
          {hasChoices && <span className="text-xs text-muted-foreground">{copy.hasChoices}</span>}
          {hasChoices && quantity > 0 && <span className="text-xs font-semibold text-primary">{copy.inOrder(quantity)}</span>}
        </span>
      </span>
      {p.isAvailable &&
        (hasStepper ? (
          <span role="group" aria-label={copy.quantityOf(p.name)} className="flex items-center gap-1 rounded-full bg-primary/10 p-0.5">
            <button type="button" aria-label={copy.decrease(p.name)} className={cn(roundButton, "text-primary hover:bg-primary/15")} onClick={() => onDecrease?.(p)}>
              <Minus className="size-5" />
            </button>
            <span key={quantity} className="min-w-6 animate-in text-center font-bold tabular-nums zoom-in-75">
              {quantity}
            </span>
            <button type="button" aria-label={copy.increase(p.name)} className={cn(roundButton, "bg-primary text-primary-foreground")} onClick={() => tap(p, onSelect)}>
              <Plus className="size-5" />
            </button>
          </span>
        ) : (
          <button type="button" aria-label={copy.increase(p.name)} className={cn(roundButton, "bg-primary text-primary-foreground shadow-sm")} onClick={() => tap(p, onSelect)}>
            <Plus className="size-6" />
          </button>
        ))}
    </div>
  );
}
