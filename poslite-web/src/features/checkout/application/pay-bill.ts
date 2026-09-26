import { getDb, type OpenBillLine, type OrderRow } from "@/shared/db";
import { newId } from "@/shared/id";

import type { Discount } from "../domain/pricing";
import { type PlaceOrderDeps, placeOrder, placeOrderTables } from "./place-order";

export interface PayBillInput {
  bill: { id: string; tableId: string | null; tableLabel: string; openedBy: string; openedAt: string };
  cashier: { id: string; name: string };
  /** Lines paid now — the whole bill, or the part chosen when splitting by item. */
  paying: OpenBillLine[];
  /** What stays on the bill; empty closes it. */
  remaining: OpenBillLine[];
  discount: Discount | null;
  payments: { paymentMethodId: string; amount: number; reference?: string | null }[];
}

const defaultDeps = (): PlaceOrderDeps => ({ db: getDb(), now: () => new Date(), newId });

/**
 * Pays (part of) an open dine-in bill (ADR-015): the order and the bill update commit together,
 * so a failed payment leaves the bill exactly as it was.
 */
export async function payBill(input: PayBillInput, deps: PlaceOrderDeps = defaultDeps()): Promise<OrderRow> {
  const { db } = deps;
  return db.transaction("rw", [...placeOrderTables(db), db.openBills], async () => {
    const order = await placeOrder(
      {
        cashier: input.cashier,
        orderType: "dine_in",
        tableLabel: input.bill.tableLabel,
        lines: input.paying,
        discount: input.discount,
        payments: input.payments,
      },
      deps,
    );
    if (input.remaining.length === 0) await db.openBills.delete(input.bill.id);
    else await db.openBills.put({ ...input.bill, lines: input.remaining, discount: input.discount, updatedAt: order.createdAt });
    return order;
  });
}
