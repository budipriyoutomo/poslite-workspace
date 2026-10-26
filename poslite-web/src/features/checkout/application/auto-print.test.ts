import { describe, expect, it, vi } from "vitest";

import { createTestDb } from "../../../../tests/support/test-db";
import { isAutoPrintOn, printIfAuto, setAutoPrint } from "./auto-print";

describe("auto print receipt (15 · UX-03)", () => {
  it("is off on a new device", async () => {
    expect(await isAutoPrintOn(createTestDb())).toBe(false);
  });

  it("is remembered per device once turned on", async () => {
    const db = createTestDb();
    await setAutoPrint(db, true);
    expect(await isAutoPrintOn(db)).toBe(true);
  });

  it("prints the receipt after a sale when on", async () => {
    const db = createTestDb();
    await setAutoPrint(db, true);
    const print = vi.fn(async () => true);

    expect(await printIfAuto("01ORDER", { db, print })).toBe("printed");
    expect(print).toHaveBeenCalledWith("01ORDER");
  });

  it("does not print when off", async () => {
    const print = vi.fn(async () => true);
    expect(await printIfAuto("01ORDER", { db: createTestDb(), print })).toBe("off");
    expect(print).not.toHaveBeenCalled();
  });

  it("reports a failed print without throwing: the sale stands", async () => {
    const db = createTestDb();
    await setAutoPrint(db, true);
    expect(await printIfAuto("01ORDER", { db, print: async () => false })).toBe("failed");
  });
});
