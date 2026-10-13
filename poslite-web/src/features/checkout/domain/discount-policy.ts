/**
 * When a manual discount needs a manager (06 Order rule 5). Limits are set per brand.
 * Mirrors `needs_approval` in poslite-api; both are pinned by
 * tests/fixtures/discount-approval-cases.json. Promotions (chosen at payment) never need approval.
 */
export interface DiscountLimits {
  maxPercentage: number; // a cashier may give up to this percentage alone (0..100)
  maxAmount: number; // ...and up to this many Rupiah of manual discount per order
}

export function needsApproval(input: { role: "cashier" | "manager" | "owner"; manualPercentages: number[]; manualAmount: number; limits: DiscountLimits }): boolean {
  if (input.role !== "cashier" || (input.manualPercentages.length === 0 && input.manualAmount === 0)) return false;
  return input.manualPercentages.some((p) => p > input.limits.maxPercentage) || input.manualAmount > input.limits.maxAmount;
}

/** Percentages and Rupiah of the discounts a person gave: manual lines (no promotion) + order discount. */
export function manualDiscounts(
  lines: { discount: { type: "percentage" | "fixed"; value: number } | null; promotion: unknown; amount: number }[],
  orderDiscount: { type: "percentage" | "fixed"; value: number } | null,
  orderDiscountAmount: number,
): { percentages: number[]; amount: number } {
  const manual = lines.filter((l) => l.discount && !l.promotion);
  const percentages = manual.flatMap((l) => (l.discount!.type === "percentage" ? [l.discount!.value] : []));
  if (orderDiscount?.type === "percentage") percentages.push(orderDiscount.value);
  return { percentages, amount: manual.reduce((s, l) => s + l.amount, 0) + orderDiscountAmount };
}
