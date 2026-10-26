import { describe, expect, it } from "vitest";

import { createTestDb } from "../../../../tests/support/test-db";
import { menuViewOf, setMenuView } from "./menu-view";

describe("menu view (15 · UX-06)", () => {
  it("is compact on a new device", async () => {
    expect(await menuViewOf(createTestDb())).toBe("compact");
  });

  it("is remembered per device", async () => {
    const db = createTestDb();
    await setMenuView(db, "photo");
    expect(await menuViewOf(db)).toBe("photo");
  });
});
