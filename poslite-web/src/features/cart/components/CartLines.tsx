"use client";

import { Minus, Pencil, Percent, Plus, ShoppingCart, X } from "lucide-react";
import { useState } from "react";

import { DEFAULT_DISCOUNT_POLICY } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { hasDiscountChoices } from "@/shared/ui/discount-chooser";

import { useCart } from "../application/cart-store";
import { copy } from "../copy";
import { cartLines } from "../domain/cart";
import { LineDiscountDialog } from "./LineDiscountDialog";

/** `applied[i]`: the discount on line i (promotion name or "Diskon …"), priced by checkout. */
export interface AppliedLineDiscount {
  label: string;
  amount: number;
}

export function CartLines({ onEdit, applied }: { onEdit: (key: string) => void; applied?: (AppliedLineDiscount | null)[] }) {
  const lines = useCart((s) => s.lines);
  const changeQuantity = useCart((s) => s.changeQuantity);
  const setLineDiscount = useCart((s) => s.setLineDiscount);
  const [discounting, setDiscounting] = useState<string | null>(null);
  const discountingLine = lines.find((l) => l.key === discounting);
  const canDiscount = hasDiscountChoices(useOutletSetting()?.discountPolicy ?? DEFAULT_DISCOUNT_POLICY);

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
        <ShoppingCart className="size-10 text-slate-300" />
        <p className="font-medium">{copy.empty}</p>
        <p className="text-sm">{copy.emptyHint}</p>
      </div>
    );
  }

  const priced = cartLines(lines);
  return (
    <ul className="flex-1 divide-y overflow-y-auto">
      {lines.map((line, i) => (
        <li key={line.key} className="flex gap-3 py-3">
          <div className="min-w-0 flex-1">
            <button type="button" className="text-left font-semibold hover:underline" aria-label={copy.edit(line.name)} onClick={() => onEdit(line.key)}>
              {line.name} <Pencil className="inline size-3 text-muted-foreground" />
            </button>
            {line.modifiers.map((m) => (
              <p key={m.optionId} className="text-xs text-muted-foreground">
                + {m.name}
                {m.price > 0 && ` (${formatRupiah(m.price)})`}
              </p>
            ))}
            {line.note && <p className="text-xs text-amber-700 italic">“{line.note}”</p>}
            <p className="mt-1 text-sm font-medium">{formatRupiah((priced[i]!.unitPrice + priced[i]!.modifiersTotal) * line.quantity)}</p>
            {applied?.[i] && applied[i]!.amount > 0 && (
              <p className="flex justify-between text-xs text-emerald-700">
                <span>{applied[i]!.label}</span>
                <span className="tabular-nums">{formatRupiah(-applied[i]!.amount)}</span>
              </p>
            )}
            {line.discount ? (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs text-red-600" aria-label={copy.removeLineDiscount(line.name)} onClick={() => setLineDiscount(line.key, null)}>
                <X className="size-3" /> Hapus diskon
              </Button>
            ) : (
              canDiscount && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" aria-label={copy.lineDiscount(line.name)} onClick={() => setDiscounting(line.key)}>
                  <Percent className="size-3" /> Diskon item
                </Button>
              )
            )}
          </div>
          <div className="flex items-center gap-1 self-center">
            <Button size="icon-sm" variant="outline" aria-label={copy.decrease(line.name)} onClick={() => changeQuantity(line.key, -1)}>
              <Minus />
            </Button>
            <span aria-label={copy.quantity(line.name)} className="w-7 text-center font-semibold tabular-nums">
              {line.quantity}
            </span>
            <Button size="icon-sm" variant="outline" aria-label={copy.increase(line.name)} onClick={() => changeQuantity(line.key, +1)}>
              <Plus />
            </Button>
          </div>
        </li>
      ))}
      {discountingLine && (
        <LineDiscountDialog
          name={discountingLine.name}
          onChoose={(discount) => (setLineDiscount(discountingLine.key, discount), setDiscounting(null))}
          onClose={() => setDiscounting(null)}
        />
      )}
    </ul>
  );
}
