import type { Discount } from "./pricing";

/**
 * Split bill by item (06 "Open Bill & Split"): `take[key]` units of each line are paid now as
 * their own order; the rest stays on the bill. A line keeps its own discount in both parts.
 */
export function splitLines<L extends { key: string; quantity: number }>(lines: L[], take: Record<string, number>): { paying: L[]; remaining: L[] } {
  const paying: L[] = [];
  const remaining: L[] = [];
  for (const line of lines) {
    const qty = take[line.key] ?? 0;
    if (!Number.isInteger(qty) || qty < 0 || qty > line.quantity) throw new RangeError(`cannot pay ${qty} of ${line.quantity}`);
    if (qty > 0) paying.push({ ...line, quantity: qty });
    if (qty < line.quantity) remaining.push(qty > 0 ? { ...line, quantity: line.quantity - qty } : line);
  }
  if (paying.length === 0) throw new RangeError("nothing to pay");
  return { paying, remaining };
}

/** A fixed order discount cannot be shared fairly between parts, so it needs the whole bill. */
export const canSplit = (orderDiscount: Discount | null) => orderDiscount?.type !== "fixed";
