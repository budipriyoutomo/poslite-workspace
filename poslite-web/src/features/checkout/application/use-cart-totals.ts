"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { useCart } from "@/features/cart";
import { availablePromotions, localMoment } from "@/features/promotions";
import { getDb } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";

import type { Discount, Rates } from "../domain/pricing";
import { type CartLineToPrice, priceCart } from "./price-cart";

/**
 * Live prices of some lines with the outlet's rates and the promotions the cashier chose. The
 * schedule check uses the time of this render; placeOrder checks again at payment (ADR-016).
 */
export function usePricing(lines: CartLineToPrice[], discount: Discount | null, rates: Rates, promotionIds: string[]) {
  const promotions = useLiveQuery(() => getDb().promotions.toArray(), []) ?? [];
  const timezone = useOutletSetting()?.timezone ?? "Asia/Jakarta";
  const chosen = promotions.filter((p) => promotionIds.includes(p.id));
  const priced = priceCart(lines, discount, rates, chosen, localMoment(new Date(), timezone));
  return { ...priced.totals, lines: priced.lines, itemDiscounts: priced.itemDiscounts, orderDiscount: priced.orderDiscount };
}

/** Live totals of the active cart. */
export function useCartTotals(rates: Rates) {
  const lines = useCart((s) => s.lines);
  const discount = useCart((s) => s.discount);
  const promotionIds = useCart((s) => s.promotionIds);
  return { ...usePricing(lines, discount, rates, promotionIds), discount, isEmpty: lines.length === 0 };
}

/** Promotions the cashier may choose for these lines right now, biggest saving first (ADR-016). */
export function useAvailablePromotions(lines: CartLineToPrice[]) {
  const promotions = useLiveQuery(() => getDb().promotions.toArray(), []) ?? [];
  const timezone = useOutletSetting()?.timezone ?? "Asia/Jakarta";
  const promoLines = lines.map((l) => ({
    productId: l.productId,
    categoryId: l.categoryId,
    unitPrice: l.unitPrice,
    modifiersTotal: l.modifiers.reduce((s, m) => s + m.price, 0),
    quantity: l.quantity,
    manualDiscount: l.discount ?? null,
  }));
  return availablePromotions(promoLines, promotions, localMoment(new Date(), timezone));
}
