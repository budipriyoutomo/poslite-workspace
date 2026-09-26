import { type AppliedDiscount, applyPromotions, type Promotion } from "@/features/promotions";

import { calculate, type Discount, discountAmount, lineTotal, type PriceBreakdown, type Rates } from "../domain/pricing";

export interface CartLineToPrice {
  productId: string;
  categoryId?: string;
  unitPrice: number;
  modifiers: { price: number }[];
  quantity: number;
  /** The cashier's manual line discount, if any. */
  discount?: Discount | null;
}

export interface PricedCart {
  lines: (AppliedDiscount & { amount: number })[];
  itemDiscounts: number;
  orderDiscount: number;
  totals: PriceBreakdown;
}

/**
 * Line discounts (manual, else the best running promotion), then the order totals — what the
 * cart shows and exactly what placeOrder stores (ADR-016).
 */
export function priceCart(
  lines: CartLineToPrice[],
  orderDiscount: Discount | null,
  rates: Rates,
  promotions: Promotion[],
  at: { date: string; time: string; weekday: number },
): PricedCart {
  const priced = lines.map((l) => ({ unitPrice: l.unitPrice, modifiersTotal: l.modifiers.reduce((s, m) => s + m.price, 0), quantity: l.quantity }));
  const applied = applyPromotions(
    lines.map((l, i) => ({ productId: l.productId, categoryId: l.categoryId, ...priced[i]!, manualDiscount: l.discount ?? null })),
    promotions,
    at,
  );
  const withAmounts = applied.map((a, i) => ({ ...a, amount: discountAmount(lineTotal(priced[i]!), a.discount) }));
  const totals = calculate(
    priced.map((p, i) => ({ ...p, discount: applied[i]!.discount })),
    orderDiscount,
    rates,
  );
  const itemDiscounts = withAmounts.reduce((s, l) => s + l.amount, 0);
  return { lines: withAmounts, itemDiscounts, orderDiscount: totals.discountAmount - itemDiscounts, totals };
}
