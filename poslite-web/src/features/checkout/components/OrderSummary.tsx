"use client";

import { Percent, X } from "lucide-react";
import { type ReactNode, useState } from "react";

import { useCart } from "@/features/cart";
import { DEFAULT_DISCOUNT_POLICY } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { hasDiscountChoices } from "@/shared/ui/discount-chooser";

import { useCartTotals } from "../application/use-cart-totals";
import { copy } from "../copy";
import type { Rates } from "../domain/pricing";
import { DiscountPicker } from "./DiscountPicker";

/** Totals of the active cart; `children` is the call to action (e.g. the Bayar button). */
export function OrderSummary({ rates, children }: { rates: Rates; children?: ReactNode }) {
  const totals = useCartTotals(rates);
  const setDiscount = useCart((s) => s.setDiscount);
  const [isPicking, setIsPicking] = useState(false);
  const canDiscount = hasDiscountChoices(useOutletSetting()?.discountPolicy ?? DEFAULT_DISCOUNT_POLICY);
  const discountLabel = totals.discount?.type === "percentage" ? `${copy.discount} ${totals.discount.value}%` : copy.discount;

  const rows: [string, number][] = [[copy.subtotal, totals.subtotal]];
  if (totals.itemDiscounts > 0) rows.push([copy.itemDiscount, -totals.itemDiscounts]);
  if (totals.orderDiscount > 0) rows.push([discountLabel, -totals.orderDiscount]);
  // Prices that include tax (ADR-030): service and PB1 are inside the total, shown after it.
  const rateRows: [string, number][] = [];
  if (rates.serviceBps > 0) rateRows.push([rates.includesTax ? copy.includedService(rates.serviceBps) : copy.service(rates.serviceBps), totals.serviceCharge]);
  if (rates.taxBps > 0) rateRows.push([rates.includesTax ? copy.includedTax(rates.taxBps) : copy.tax(rates.taxBps), totals.tax]);
  if (!rates.includesTax) rows.push(...rateRows);

  return (
    <div className="space-y-3 border-t pt-3">
      {totals.discount ? (
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDiscount(null)}>
          <X /> {copy.removeDiscount}
        </Button>
      ) : (
        canDiscount && (
          <Button variant="outline" size="sm" disabled={totals.isEmpty} onClick={() => setIsPicking(true)}>
            <Percent /> {copy.addDiscount}
          </Button>
        )
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
        {rates.includesTax &&
          rateRows.map(([label, value]) => (
            <div key={label} className="flex justify-between text-xs">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-muted-foreground tabular-nums">{formatRupiah(value)}</dd>
            </div>
          ))}
      </dl>
      {children}
      <DiscountPicker open={isPicking} onOpenChange={setIsPicking} />
    </div>
  );
}
