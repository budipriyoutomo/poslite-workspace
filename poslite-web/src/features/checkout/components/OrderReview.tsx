"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { formatRupiah } from "@/shared/money";
import { cn } from "@/shared/ui/utils";

import { copy } from "../copy";

/** Order lines and totals; folded behind a one-line summary on phones (below `md`) so payment is in view first. */
export function OrderReview({ itemCount, total, forceOpen = false, children }: { itemCount: number; total: number; forceOpen?: boolean; children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const isExpanded = isOpen || forceOpen;
  const id = useId();

  return (
    <>
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={id}
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2.5 text-left text-sm md:hidden"
      >
        <span className="font-semibold">{copy.orderDetails}</span>
        <span className="ml-auto text-muted-foreground">{copy.itemsAndTotal(itemCount, formatRupiah(total))}</span>
        <ChevronDown aria-hidden className={cn("size-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
      </button>
      <div id={id} className={cn("max-md:mt-2", !isExpanded && "max-md:hidden")}>
        {children}
      </div>
    </>
  );
}
