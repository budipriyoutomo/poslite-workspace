import { divRoundHalfUp } from "@/shared/money";

/**
 * Shares an order's total out to its lines (ADR-023), so refunds — whole or in steps — can never
 * add up to more than what was paid. Mirrors `RefundAllocator` in poslite-api; both are pinned by
 * tests/fixtures/refund-cases.json.
 *
 * net_i   = line gross − line discount (manual or promotion)
 * base_i  = net_i − its share of the order discount (proportional to net_i)
 * alloc_i = its share of the order total (proportional to base_i)
 */
export function allocateTotal(lines: { net: number }[], orderDiscount: number, total: number): number[] {
  const nets = lines.map((l) => l.net);
  const shares = largestRemainder(orderDiscount, nets);
  return largestRemainder(
    total,
    nets.map((n, i) => n - shares[i]!),
  );
}

/** Refunding units one step at a time always adds up to `allocated` for the whole line. */
export function refundAmount({ allocated, quantity, alreadyRefunded, refundQuantity }: { allocated: number; quantity: number; alreadyRefunded: number; refundQuantity: number }): number {
  if (refundQuantity <= 0 || alreadyRefunded + refundQuantity > quantity) {
    throw new RangeError(`only ${quantity - alreadyRefunded} unit(s) left to refund, got ${refundQuantity}`);
  }
  return divRoundHalfUp(allocated * (alreadyRefunded + refundQuantity), quantity) - divRoundHalfUp(allocated * alreadyRefunded, quantity);
}

/** `value` split proportionally to `weights`, summing to exactly `value`: floors first, then 1
 * Rupiah each to the largest remainders (ties: the earliest line). All weights 0 → all 0. */
export function largestRemainder(value: number, weights: number[]): number[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return weights.map(() => 0);
  const parts = weights.map((w) => Math.floor((value * w) / totalWeight));
  const left = value - parts.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => ({ i, rest: (value * w) % totalWeight })).sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of order.slice(0, left)) parts[i]! += 1;
  return parts;
}
