import { voidedUnits } from "@/features/cart";
import { getDb, type OpenBillLine, type OrderRow } from "@/shared/db";
import { AppError } from "@/shared/errors";
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
  /** Promotions the cashier chose at payment (ADR-016). */
  promotionIds?: string[];
  payments: { paymentMethodId: string; amount: number; reference?: string | null }[];
  /** Manager who approved a discount over the brand's cashier limit (06 Order rule 5). */
  discountApprovedBy?: string | null;
  /** Table-service outlet (ADR-031): the bill is shared through the server. */
  shared?: boolean;
}

const defaultDeps = (): PlaceOrderDeps => ({ db: getDb(), now: () => new Date(), newId });

/**
 * Pays (part of) an open dine-in bill (ADR-015): the order and the bill update commit together,
 * so a failed payment leaves the bill exactly as it was. A shared bill (ADR-031) is closed on the
 * server by the payment itself; what a split leaves on it is saved to the server next sync.
 */
export async function payBill(input: PayBillInput, deps: PlaceOrderDeps = defaultDeps()): Promise<OrderRow> {
  const { db } = deps;
  return db.transaction("rw", [...placeOrderTables(db), db.openBills], async () => {
    // Taking a sent item off is a void a manager approves when the bill is saved (ADR-028).
    const saved = await db.openBills.get(input.bill.id);
    if (saved && voidedUnits(saved.lines, [...input.paying, ...input.remaining]).length > 0) throw new AppError("VOID_APPROVAL_REQUIRED");
    const order = await placeOrder(
      {
        cashier: input.cashier,
        orderType: "dine_in",
        tableLabel: input.bill.tableLabel,
        lines: input.paying,
        discount: input.discount,
        promotionIds: input.promotionIds ?? [],
        payments: input.payments,
        discountApprovedBy: input.discountApprovedBy ?? null,
        closesBillId: input.shared && input.remaining.length === 0 ? input.bill.id : null,
      },
      deps,
    );
    if (input.remaining.length === 0) await db.openBills.delete(input.bill.id);
    else
      await db.openBills.put({
        ...saved,
        ...input.bill,
        lines: input.remaining,
        discount: input.discount,
        updatedAt: order.createdAt,
        origin: saved?.origin ?? "local",
        ...(input.shared && { dirty: true }),
      });
    return order;
  });
}
