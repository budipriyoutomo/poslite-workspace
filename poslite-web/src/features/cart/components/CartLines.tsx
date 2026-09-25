"use client";

import { Minus, Pencil, Plus, ShoppingCart } from "lucide-react";

import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";

import { useCart } from "../application/cart-store";
import { copy } from "../copy";
import { cartLines } from "../domain/cart";

export function CartLines({ onEdit }: { onEdit: (key: string) => void }) {
  const lines = useCart((s) => s.lines);
  const changeQuantity = useCart((s) => s.changeQuantity);

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
    </ul>
  );
}
