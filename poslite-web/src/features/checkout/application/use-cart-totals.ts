"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { useCart } from "@/features/cart";
import { localMoment } from "@/features/promotions";
import { getDb } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";

import type { Discount, Rates } from "../domain/pricing";
import { type CartLineToPrice, priceCart } from "./price-cart";

/**
 * Live prices of some lines with the outlet's rates and running promotions. The promotion check
 * uses the time of this render; placeOrder decides again at payment (ADR-016).
 */
export function usePricing(lines: CartLineToPrice[], discount: Discount | null, rates: Rates) {
  const promotions = useLiveQuery(() => getDb().promotions.toArray(), []) ?? [];
  const timezone = useOutletSetting()?.timezone ?? "Asia/Jakarta";
  const priced = priceCart(lines, discount, rates, promotions, localMoment(new Date(), timezone));
  return { ...priced.totals, lines: priced.lines, itemDiscounts: priced.itemDiscounts, orderDiscount: priced.orderDiscount };
}

/** Live totals of the active cart. */
export function useCartTotals(rates: Rates) {
  const lines = useCart((s) => s.lines);
  const discount = useCart((s) => s.discount);
  return { ...usePricing(lines, discount, rates), discount, isEmpty: lines.length === 0 };
}
