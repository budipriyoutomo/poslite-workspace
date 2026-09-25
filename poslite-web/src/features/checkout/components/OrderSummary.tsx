"use client";

import { Percent, X } from "lucide-react";
import { type ReactNode, useState } from "react";

import { useCart } from "@/features/cart";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";

import { useCartTotals } from "../application/use-cart-totals";
import { copy } from "../copy";
import type { Rates } from "../domain/pricing";
import { DiscountPicker } from "./DiscountPicker";

/** Totals of the active cart; `children` is the call to action (e.g. the Bayar button). */
export function OrderSummary({ rates, children }: { rates: Rates; children?: ReactNode }) {
  const totals = useCartTotals(rates);
  const setDiscount = useCart((s) => s.setDiscount);
  const [isPicking, setIsPicking] = useState(false);
  const discountLabel = totals.discount?.type === "percentage" ? `${copy.discount} ${totals.discount.value}%` : copy.discount;

  const rows: [string, number][] = [[copy.subtotal, totals.subtotal]];
  if (totals.discountAmount > 0) rows.push([discountLabel, -totals.discountAmount]);
  if (rates.serviceBps > 0) rows.push([copy.service(rates.serviceBps), totals.serviceCharge]);
  if (rates.taxBps > 0) rows.push([copy.tax(rates.taxBps), totals.tax]);

  return (
    <div className="space-y-3 border-t pt-3">
      {totals.discount ? (
        <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setDiscount(null)}>
          <X /> {copy.removeDiscount}
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={totals.isEmpty} onClick={() => setIsPicking(true)}>
          <Percent /> {copy.addDiscount}
        </Button>
      )}
      <dl className="space-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{formatRupiah(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t pt-2 text-lg font-bold">
          <dt>{copy.total}</dt>
          <dd className="tabular-nums">{formatRupiah(totals.total)}</dd>
        </div>
      </dl>
      {children}
      <DiscountPicker open={isPicking} onOpenChange={setIsPicking} />
    </div>
  );
}
