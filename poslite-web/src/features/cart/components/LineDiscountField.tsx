"use client";

import { Percent, X } from "lucide-react";
import { useState } from "react";

import { DEFAULT_DISCOUNT_POLICY } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";
import { Button } from "@/shared/ui/button";
import { hasDiscountChoices } from "@/shared/ui/discount-chooser";

import { useCart } from "../application/cart-store";
import { copy } from "../copy";
import { LineDiscountDialog } from "./LineDiscountDialog";

/** A line's manual discount, inside the line's edit dialog (15 · UX-06): out of sight while selling. */
export function LineDiscountField({ lineKey }: { lineKey: string }) {
  const line = useCart((s) => s.lines.find((l) => l.key === lineKey));
  const setLineDiscount = useCart((s) => s.setLineDiscount);
  const [isChoosing, setIsChoosing] = useState(false);
  const canDiscount = hasDiscountChoices(useOutletSetting()?.discountPolicy ?? DEFAULT_DISCOUNT_POLICY);
  if (!line) return null;

  if (line.discount) {
    const label = line.discount.type === "percentage" ? `${line.discount.value}%` : null;
    return (
      <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
        <span>{label ? `${copy.lineDiscountLabel} ${label}` : copy.lineDiscountLabel}</span>
        <Button variant="ghost" size="sm" className="text-destructive" aria-label={copy.removeLineDiscount(line.name)} onClick={() => setLineDiscount(line.key, null)}>
          <X /> {copy.removeDiscount}
        </Button>
      </div>
    );
  }
  if (!canDiscount) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="w-full" aria-label={copy.lineDiscount(line.name)} onClick={() => setIsChoosing(true)}>
        <Percent /> {copy.lineDiscountLabel}
      </Button>
      {isChoosing && (
        <LineDiscountDialog
          name={line.name}
          onChoose={(discount) => (setLineDiscount(line.key, discount), setIsChoosing(false))}
          onClose={() => setIsChoosing(false)}
        />
      )}
    </>
  );
}
