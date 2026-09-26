"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { useCart } from "@/features/cart";
import { localMoment } from "@/features/promotions";
import { getDb } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";

import type { Rates } from "../domain/pricing";
import { priceCart } from "./price-cart";

/**
 * Live totals of the active cart with the outlet's current rates and running promotions. The
 * promotion check uses the time of this render; placeOrder decides again at payment (ADR-016).
 */
export function useCartTotals(rates: Rates) {
  const lines = useCart((s) => s.lines);
  const discount = useCart((s) => s.discount);
  const promotions = useLiveQuery(() => getDb().promotions.toArray(), []) ?? [];
  const timezone = useOutletSetting()?.timezone ?? "Asia/Jakarta";
  const priced = priceCart(lines, discount, rates, promotions, localMoment(new Date(), timezone));
  return { ...priced.totals, lines: priced.lines, itemDiscounts: priced.itemDiscounts, orderDiscount: priced.orderDiscount, discount, isEmpty: lines.length === 0 };
}
