import { z } from "zod";

import type { OutboxEventType } from "@/shared/db";

// Push payloads (07-api-contract.md): snake_case, integer Rupiah, rates in basis points.
// Mirrored by Pydantic models in poslite-api — change both together.

const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "ULID");
const rupiah = z.number().int().nonnegative();
const bps = z.number().int().nonnegative();
const paymentMethodType = z.enum(["cash", "debit", "qris", "credit_card", "voucher", "other"]);

const shiftOpened = z.strictObject({
  opening_cash: rupiah,
  opened_by: ulid,
});

const shiftClosed = z.strictObject({
  closed_by: ulid,
  counted_cash: rupiah,
  expected_cash: z.number().int(),
  variance: z.number().int(),
});

const cashMoved = z.strictObject({
  shift_id: ulid,
  type: z.enum(["in", "out"]),
  amount: rupiah.positive(),
  reason: z.string().min(1).max(200),
  created_by: ulid,
});

const discount = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("percentage"), value: z.number().int().min(0).max(100) }),
  z.strictObject({ type: z.literal("fixed"), value: rupiah }),
]);

export const orderPlaced = z.strictObject({
  shift_id: ulid,
  receipt_no: z.string().min(1),
  cashier_id: ulid,
  order_type: z.enum(["take_away", "dine_in"]),
  table_label: z.string().min(1).max(30).nullable().optional(),
  lines: z
    .array(
      z.strictObject({
        id: ulid,
        product_id: ulid,
        product_name: z.string().min(1),
        category_name: z.string(),
        unit_price: rupiah,
        quantity: z.number().int().positive(),
        notes: z.string(),
        modifiers: z.array(z.strictObject({ modifier_option_id: ulid, name: z.string().min(1), price: rupiah })),
        // Line discount and the promotion that gave it (ADR-016); optional for pre-Fase 4 events.
        discount: discount.nullable().optional(),
        promotion: z.strictObject({ id: ulid, name: z.string().min(1).max(100) }).nullable().optional(),
      }),
    )
    .min(1),
  discount: discount.nullable(),
  rates: z.strictObject({ service_bps: bps, tax_bps: bps }),
  totals: z.strictObject({ subtotal: rupiah, discount_amount: rupiah, service_charge: rupiah, tax: rupiah, total: rupiah }),
  payments: z
    .array(
      z.strictObject({ id: ulid, payment_method_id: ulid, method_type: paymentMethodType, amount: rupiah, reference: z.string().nullable() }),
    )
    .min(1),
  change_amount: rupiah,
});

const orderVoided = z.strictObject({
  reason: z.string().min(1).max(200),
  voided_by: ulid,
  approved_by: ulid.nullable(),
});

export const eventPayloads: Record<OutboxEventType, z.ZodType> = {
  "shift.opened": shiftOpened,
  "shift.closed": shiftClosed,
  "cash.moved": cashMoved,
  "order.placed": orderPlaced,
  "order.voided": orderVoided,
};

export type OrderPlacedPayload = z.infer<typeof orderPlaced>;
