"use client";

import { Check, Tag } from "lucide-react";

import type { AvailablePromotion } from "@/features/promotions";
import { formatRupiah } from "@/shared/money";
import { cn } from "@/shared/ui/utils";

import { copy } from "../copy";

/**
 * The promotions running now for these items (ADR-016). None applies until the cashier taps it;
 * on a line, a manual discount still wins and among chosen promotions the biggest saving does.
 */
export function PromotionPicker({ available, chosenIds, onToggle }: { available: AvailablePromotion[]; chosenIds: string[]; onToggle: (id: string) => void }) {
  if (available.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">{copy.promotions}</h3>
      <div className="flex flex-wrap gap-2">
        {available.map(({ promotion, amount }) => {
          const isChosen = chosenIds.includes(promotion.id);
          return (
            <button
              key={promotion.id}
              type="button"
              aria-pressed={isChosen}
              onClick={() => onToggle(promotion.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                isChosen ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              {isChosen ? <Check className="size-4" /> : <Tag className="size-4" />}
              <span className="font-medium">{promotion.name}</span>
              <span className="text-xs text-muted-foreground">{copy.promotionSaving(formatRupiah(amount))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
