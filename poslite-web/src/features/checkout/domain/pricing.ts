import { divRoundHalfUp } from "@/shared/money";

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

export function lineTotal(line: PricedLine): number {
  assertRupiah(line.unitPrice, "unitPrice");
  assertRupiah(line.modifiersTotal, "modifiersTotal");
  if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
    throw new RangeError(`quantity must be a positive integer, got ${line.quantity}`);
  }
  return (line.unitPrice + line.modifiersTotal) * line.quantity;
}

function discountAmount(subtotal: number, discount: Discount | null): number {
  if (!discount) return 0;
  if (discount.type === "percentage") {
    if (!Number.isInteger(discount.value) || discount.value < 0 || discount.value > 100) {
      throw new RangeError(`percentage discount must be an integer 0..100, got ${discount.value}`);
    }
    return divRoundHalfUp(subtotal * discount.value, 100);
  }
  assertRupiah(discount.value, "fixed discount");
  return Math.min(discount.value, subtotal);
}

/**
 * Order totals (06-domain-and-database.md): discount on the subtotal, service on the net,
 * PB1 on net + service. `rates` is the outlet snapshot sent with order.placed (ADR-011).
 */
export function calculate(lines: PricedLine[], discount: Discount | null, rates: Rates): PriceBreakdown {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const discounted = discountAmount(subtotal, discount);
  const net = subtotal - discounted;
  const serviceCharge = divRoundHalfUp(net * rates.serviceBps, 10_000);
  const tax = divRoundHalfUp((net + serviceCharge) * rates.taxBps, 10_000);
  return { subtotal, discountAmount: discounted, serviceCharge, tax, total: net + serviceCharge + tax };
}
