import { discountAmount, divRoundHalfUp } from "@/shared/money";

export { discountAmount };

export type Discount =
  | { type: "percentage"; value: number } // integer 0..100
  | { type: "fixed"; value: number }; // Rupiah (integer)

export interface Rates {
  serviceBps: number; // basis points: 500 = 5%
  taxBps: number; // PB1, 1000 = 10%
}

export interface PricedLine {
  unitPrice: number; // Rupiah
  modifiersTotal: number; // Rupiah, per unit
  quantity: number;
  /** One per line: manual or from a promotion (ADR-016). */
  discount?: Discount | null;
}

export interface PriceBreakdown {
  subtotal: number;
  discountAmount: number;
  serviceCharge: number;
  tax: number;
  total: number;
}

function assertRupiah(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${what} must be an integer Rupiah >= 0, got ${value}`);
}

/** Gross line value, before the line discount. */
export function lineTotal(line: PricedLine): number {
  assertRupiah(line.unitPrice, "unitPrice");
  assertRupiah(line.modifiersTotal, "modifiersTotal");
  if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
    throw new RangeError(`quantity must be a positive integer, got ${line.quantity}`);
  }
  return (line.unitPrice + line.modifiersTotal) * line.quantity;
}

/**
 * Order totals (06-domain-and-database.md, Order rules 8–9): line discounts, then the order
 * discount on what is left, service on the net, PB1 on net + service. `rates` is the outlet
 * snapshot sent with order.placed (ADR-011).
 */
export function calculate(lines: PricedLine[], discount: Discount | null, rates: Rates): PriceBreakdown {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const itemDiscounts = lines.reduce((sum, line) => sum + discountAmount(lineTotal(line), line.discount), 0);
  const discounted = itemDiscounts + discountAmount(subtotal - itemDiscounts, discount);
  const net = subtotal - discounted;
  const serviceCharge = divRoundHalfUp(net * rates.serviceBps, 10_000);
  const tax = divRoundHalfUp((net + serviceCharge) * rates.taxBps, 10_000);
  return { subtotal, discountAmount: discounted, serviceCharge, tax, total: net + serviceCharge + tax };
}
