import { z } from "zod";

// GET /sync/pull (07-api-contract.md "Pull"): data per entity; deletes carry no data.

const ulid = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "ULID");
const rupiah = z.number().int().nonnegative();
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const upsert = <E extends string, D extends z.ZodType>(entity: E, data: D) =>
  z.object({ entity: z.literal(entity), op: z.literal("upsert"), id: ulid, version: z.number().int(), data });

export const changeSchema = z.union([
  upsert(
    "outlet_setting",
    z.object({
      code: z.string(),
      name: z.string(),
      timezone: z.string(),
      business_day_cutoff: hhmm,
      tax_rate_bps: rupiah,
      service_rate_bps: rupiah,
      receipt_header: z.string(),
      receipt_footer: z.string(),
      // ADR-022: the outlet's brand; optional so a server from before brands still syncs.
      brand: z.object({ id: ulid, code: z.string(), name: z.string(), logo_key: z.string().nullable() }).optional(),
      // The brand's manual-discount rules (06 Order rule 5); optional for older servers.
      discount_policy: z
        .object({
          percentages: z.array(z.number().int()),
          amounts: z.array(z.number().int()),
          allow_custom: z.boolean(),
          cashier_max_percentage: z.number().int(),
          cashier_max_amount: z.number().int(),
        })
        .optional(),
      // ADR-030; optional for older servers (prices before tax).
      price_includes_tax: z.boolean().optional(),
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
      image_key: z.string().nullable(),
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
  upsert("dining_table", z.object({ label: z.string().min(1), area: z.string(), seats: z.number().int().nonnegative(), sort_order: z.number().int() })),
  upsert(
    "promotion",
    z.object({
      name: z.string().min(1),
      type: z.enum(["percent_off", "buy_x_get_y"]),
      percentage: z.number().int().min(1).max(100).nullable(),
      buy_qty: z.number().int().positive().nullable(),
      get_qty: z.number().int().positive().nullable(),
      product_ids: z.array(ulid),
      category_ids: z.array(ulid),
      days_of_week: z.array(z.number().int().min(1).max(7)),
      start_time: hhmm.nullable(),
      end_time: hhmm.nullable(),
      starts_on: isoDate.nullable(),
      ends_on: isoDate.nullable(),
    }),
  ),
  z.object({
    entity: z.enum(["outlet_setting", "category", "product", "modifier_group", "modifier_option", "payment_method", "user", "dining_table", "promotion"]),
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
  media_base_url: z.string(), // ADR-021: image URL = media_base_url + "/" + image_key
});

export type Change = z.infer<typeof changeSchema>;
