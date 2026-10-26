"use client";

import { Minus, Pencil, Plus, ShoppingCart } from "lucide-react";

import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";

import { useCart } from "../application/cart-store";
import { copy } from "../copy";
import { cartLines } from "../domain/cart";

/** `applied[i]`: the discount on line i (promotion name or "Diskon …"), priced by checkout. */
export interface AppliedLineDiscount {
  label: string;
  amount: number;
}

export function CartLines({ onEdit, applied }: { onEdit: (key: string) => void; applied?: (AppliedLineDiscount | null)[] }) {
  const lines = useCart((s) => s.lines);
  const changeQuantity = useCart((s) => s.changeQuantity);
  // Only a table's bill goes to the kitchen before payment: its lines say how much already went.
  const isBill = useCart((s) => s.bill !== null);

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
        <ShoppingCart className="size-10 text-muted-foreground/40" />
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
            {line.note && <p className="text-xs text-warning italic">“{line.note}”</p>}
            {isBill && <KitchenTags quantity={line.quantity} sent={line.sentQuantity ?? 0} />}
            <p className="mt-1 text-sm font-medium">{formatRupiah((priced[i]!.unitPrice + priced[i]!.modifiersTotal) * line.quantity)}</p>
            {applied?.[i] && applied[i]!.amount > 0 && (
              <p className="flex justify-between text-xs text-success">
                <span>{applied[i]!.label}</span>
                <span className="tabular-nums">{formatRupiah(-applied[i]!.amount)}</span>
              </p>
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
    </ul>
  );
}

/** "Di dapur 2" (yellow) and "Baru 1" (blue): what the kitchen has and what goes with the next send (15 · UX-06). */
function KitchenTags({ quantity, sent }: { quantity: number; sent: number }) {
  const inKitchen = Math.min(sent, quantity);
  const fresh = quantity - inKitchen;
  return (
    <p className="mt-1 flex flex-wrap gap-1 text-xs font-medium">
      {inKitchen > 0 && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">{copy.inKitchen(inKitchen)}</span>}
      {fresh > 0 && <span className="rounded-full bg-info/10 px-2 py-0.5 text-info">{copy.fresh(fresh)}</span>}
    </p>
  );
}
