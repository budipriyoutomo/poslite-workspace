import { describe, expect, it } from "vitest";

import page from "../../../../tests/fixtures/sync-pull.json";
import { changeSchema, pullPageSchema } from "./pull-schemas";

// Same file as poslite-api's pull contract test: the server sends exactly these fields per entity.
describe("pull contract (shared fixture)", () => {
  it("accepts the whole page", () => {
    expect(pullPageSchema.safeParse(page).error).toBeUndefined();
  });

  it.each(page.changes.map((c) => [`${c.entity} ${c.op}`, c] as const))("%s is valid", (_, change) => {
    expect(changeSchema.safeParse(change).error).toBeUndefined();
  });

  it("covers every entity the device stores", () => {
    const upserted = new Set(page.changes.filter((c) => c.op === "upsert").map((c) => c.entity));
    expect([...upserted].sort()).toEqual(
      ["category", "dining_table", "modifier_group", "modifier_option", "outlet_setting", "payment_method", "product", "promotion", "sales_channel", "user"],
    );
  });

  it("accepts an outlet_setting without a brand (server before ADR-022)", () => {
    const setting = page.changes.find((c) => c.entity === "outlet_setting")!;
    const data: Record<string, unknown> = { ...setting.data };
    delete data.brand;
    expect(changeSchema.safeParse({ ...setting, data }).error).toBeUndefined();
  });
});
