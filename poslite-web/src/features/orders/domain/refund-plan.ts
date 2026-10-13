import { allocateTotal, refundAmount } from "./refund-allocation";

/** An order as a refund sees it: a local order of this device, or one looked up online. */
export interface RefundSource {
  orderId: string;
  receiptNo: string;
  total: number;
  discountAmount: number; // line discounts + order discount, as on the order
  lines: { id: string; productName: string; quantity: number; gross: number; lineDiscount: number; refunded: number }[];
}

/** An order of this outlet found online, from any device. */
export interface LookedUpOrder {
  source: RefundSource;
  status: "paid" | "voided";
  paymentMethodIds: string[];
}

export interface RefundPlan {
  lines: { orderLineId: string; productName: string; quantity: number; amount: number }[];
  total: number;
}

/** Amounts for the chosen units per order line (ADR-023), same allocation as the server. */
export function planRefund(source: RefundSource, picks: Record<string, number>): RefundPlan {
  const lineDiscounts = source.lines.reduce((s, l) => s + l.lineDiscount, 0);
  const allocation = allocateTotal(
    source.lines.map((l) => ({ net: l.gross - l.lineDiscount })),
    source.discountAmount - lineDiscounts,
    source.total,
  );
  const lines = source.lines.flatMap((line, i) => {
    const quantity = picks[line.id] ?? 0;
    if (quantity === 0) return [];
    const amount = refundAmount({ allocated: allocation[i]!, quantity: line.quantity, alreadyRefunded: line.refunded, refundQuantity: quantity });
    return [{ orderLineId: line.id, productName: line.productName, quantity, amount }];
  });
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}
