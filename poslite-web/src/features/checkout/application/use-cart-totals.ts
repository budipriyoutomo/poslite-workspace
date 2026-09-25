"use client";

import { cartLines, useCart } from "@/features/cart";

import { calculate, type Rates } from "../domain/pricing";

/** Live totals of the active cart with the outlet's current rates. */
export function useCartTotals(rates: Rates) {
  const lines = useCart((s) => s.lines);
  const discount = useCart((s) => s.discount);
  return { ...calculate(cartLines(lines), discount, rates), discount, isEmpty: lines.length === 0 };
}
