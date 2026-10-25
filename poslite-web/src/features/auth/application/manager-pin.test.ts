import { beforeEach, describe, expect, it } from "vitest";

import type { PosDb } from "@/shared/db";

import { IDS } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { hashPin } from "../infrastructure/pin-hasher";
import { checkManagerPin } from "./manager-pin";

const SALT = btoa("salt");
let db: PosDb;
const deps = () => ({ db, now: () => new Date("2026-10-25T03:00:00.000Z") });

beforeEach(async () => {
  db = createTestDb();
  const pin = { pinHash: await hashPin("2468", SALT, 1_000), pinSalt: SALT, pinIterations: 1_000 };
  await db.users.bulkAdd([
    { id: IDS.manager, name: "Bu Rina", role: "manager", ...pin },
    { id: IDS.cashier, name: "Siti", role: "cashier", ...pin },
  ]);
});

describe("checkManagerPin (15 · UX-05)", () => {
  it("approves a manager's right PIN", async () => {
    expect(await checkManagerPin(IDS.manager, "2468", deps())).toBe(true);
  });

  it("says the PIN is wrong", async () => {
    expect(await checkManagerPin(IDS.manager, "0000", deps())).toBe("PIN salah");
  });

  it("refuses a cashier even with the right PIN", async () => {
    expect(await checkManagerPin(IDS.cashier, "2468", deps())).toBe("Hanya manajer atau pemilik yang bisa menyetujui");
  });

  it("tells when PINs are locked after too many wrong tries, like the lock screen", async () => {
    await db.syncState.put({ key: "pinLockout", value: { failures: 5, lockedUntil: "2026-10-25T03:01:00.000Z" } });
    expect(await checkManagerPin(IDS.manager, "2468", deps())).toMatch(/^Terlalu banyak PIN salah\. Coba lagi pukul \d{2}[.:]\d{2}$/);
  });
});
