import { describe, expect, it } from "vitest";

import { createTestDb } from "../../../tests/support/test-db";
import { DEMO_USERS, ensureDemoData } from "./demo-seed";

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("ensureDemoData", () => {
  it("seeds outlet settings, users, catalog and payment methods into an empty device", async () => {
    const db = createTestDb();
    expect(await ensureDemoData(db)).toBe(true);

    expect((await db.settings.get("outlet"))?.value).toMatchObject({ outletCode: "JKT01", deviceCode: "A", timezone: "Asia/Jakarta" });
    expect(await db.users.count()).toBe(DEMO_USERS.length);
    expect(await db.products.count()).toBeGreaterThanOrEqual(8);
    expect(await db.paymentMethods.where("type").equals("cash").count()).toBe(1);
    expect((await db.diningTables.orderBy("sortOrder").toArray()).map((t) => t.label)).toEqual(["A1", "A2", "A3", "A4", "B1", "B2"]);
  });

  it("does nothing on a device that already has outlet settings", async () => {
    const db = createTestDb();
    await ensureDemoData(db);
    await db.products.clear();
    expect(await ensureDemoData(db)).toBe(false);
    expect(await db.products.count()).toBe(0);
  });

  it("uses valid ULIDs and only references existing categories and modifier groups", async () => {
    const db = createTestDb();
    await ensureDemoData(db);
    const categoryIds = new Set((await db.categories.toArray()).map((c) => c.id));
    const groupIds = new Set((await db.modifierGroups.toArray()).map((g) => g.id));
    const groups = await db.modifierGroups.toArray();

    for (const p of await db.products.toArray()) {
      expect(p.id).toMatch(ULID);
      expect(categoryIds.has(p.categoryId)).toBe(true);
      for (const g of p.modifierGroupIds) expect(groupIds.has(g)).toBe(true);
    }
    for (const option of groups.flatMap((g) => g.options)) expect(option.id).toMatch(ULID);
    for (const m of await db.paymentMethods.toArray()) expect(m.id).toMatch(ULID);
  });
});
