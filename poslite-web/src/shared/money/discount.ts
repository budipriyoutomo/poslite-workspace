import { divRoundHalfUp } from "./rounding";

export type Discount = { type: "percentage"; value: number } | { type: "fixed"; value: number };

/**
 * Discount on `base` Rupiah (06 Order rules 5 and 8): percentage = integer 0..100, rounded half
 * up; fixed = integer Rupiah, never more than the base.
 */
export function discountAmount(base: number, discount: Discount | null | undefined): number {
  if (!discount) return 0;
  if (discount.type === "percentage") {
    if (!Number.isInteger(discount.value) || discount.value < 0 || discount.value > 100) {
      throw new RangeError(`percentage discount must be an integer 0..100, got ${discount.value}`);
    }
    return divRoundHalfUp(base * discount.value, 100);
  }
  if (!Number.isSafeInteger(discount.value) || discount.value < 0) throw new RangeError(`fixed discount must be an integer Rupiah >= 0, got ${discount.value}`);
  return Math.min(discount.value, base);
}
