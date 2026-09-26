import { z } from "zod";

// GET /sync/pull (07-api-contract.md "Pull"): data per entity; deletes carry no data.

const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "ULID");
const rupiah = z.number().int().nonnegative();

const upsert = <E extends string, D extends z.ZodType>(entity: E, data: D) =>
  z.object({ entity: z.literal(entity), op: z.literal("upsert"), id: ulid, version: z.number().int(), data });

export const changeSchema = z.union([
  upsert(
    "outlet_setting",
    z.object({
      code: z.string(),
      name: z.string(),
      timezone: z.string(),
      business_day_cutoff: z.string().regex(/^\d{2}:\d{2}$/),
      tax_rate_bps: rupiah,
      service_rate_bps: rupiah,
      receipt_header: z.string(),
      receipt_footer: z.string(),
    }),
  ),
  upsert("category", z.object({ name: z.string(), sort_order: z.number().int(), print_role: z.enum(["receipt", "kitchen", "bar"]) })),
  upsert(
    "product",
    z.object({
      category_id: ulid,
      sku: z.string(),
      name: z.string(),
      price: rupiah,
      image_url: z.string().nullable(),
      is_available: z.boolean(),
      modifier_group_ids: z.array(ulid),
    }),
  ),
  upsert("modifier_group", z.object({ name: z.string(), min_select: z.number().int(), max_select: z.number().int() })),
  upsert("modifier_option", z.object({ modifier_group_id: ulid, name: z.string(), price: rupiah, sort_order: z.number().int() })),
  upsert(
    "payment_method",
    z.object({
      type: z.enum(["cash", "debit", "qris", "credit_card", "voucher", "other"]),
      name: z.string(),
      requires_reference: z.boolean(),
      sort_order: z.number().int(),
      logo_url: z.string().nullable(),
    }),
  ),
  upsert(
    "user",
    z.object({
      name: z.string(),
      role: z.enum(["owner", "manager", "cashier"]),
      pin_hash: z.string().nullable(),
      pin_salt: z.string().nullable(),
      pin_iterations: z.number().int().nullable(),
    }),
  ),
  z.object({
    entity: z.enum(["outlet_setting", "category", "product", "modifier_group", "modifier_option", "payment_method", "user"]),
    op: z.literal("delete"),
    id: ulid,
    version: z.number().int(),
  }),
]);

export const pullPageSchema = z.object({
  changes: z.array(changeSchema),
  next_cursor: z.number().int().nonnegative(),
  has_more: z.boolean(),
  server_time: z.string(),
});

export type Change = z.infer<typeof changeSchema>;
