import { z } from "zod";

import { type ApiConfig, ApiError, apiRequest } from "@/shared/api";

import type { LookedUpOrder } from "../domain/refund-plan";

const detailSchema = z
  .object({
    id: z.string(),
    receipt_no: z.string(),
    status: z.enum(["paid", "voided"]),
    total: z.number().int().nonnegative(),
    discount_amount: z.number().int().nonnegative(),
    lines: z.array(
      z.object({
        id: z.string(),
        product_name: z.string(),
        quantity: z.number().int().positive(),
        line_total: z.number().int().nonnegative(),
        discount_amount: z.number().int().nonnegative(),
        refunded_quantity: z.number().int().nonnegative(),
      }),
    ),
    payments: z.array(z.object({ payment_method_id: z.string() })),
  })
  .transform(
    (d): LookedUpOrder => ({
      source: {
        orderId: d.id,
        receiptNo: d.receipt_no,
        total: d.total,
        discountAmount: d.discount_amount,
        lines: d.lines.map((l) => ({ id: l.id, productName: l.product_name, quantity: l.quantity, gross: l.line_total, lineDiscount: l.discount_amount, refunded: l.refunded_quantity })),
      },
      status: d.status,
      paymentMethodIds: d.payments.map((p) => p.payment_method_id),
    }),
  );

/** GET /orders/lookup: an order of this outlet from any device, to refund it while online (ADR-023). */
export function orderLookup(config: ApiConfig) {
  return async (receiptNo: string): Promise<LookedUpOrder | null> => {
    try {
      return await apiRequest(config, "GET", `/orders/lookup?receipt_no=${encodeURIComponent(receiptNo)}`, detailSchema);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  };
}
