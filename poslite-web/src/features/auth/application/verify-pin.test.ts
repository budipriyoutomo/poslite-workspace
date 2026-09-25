import { beforeEach, describe, expect, it } from "vitest";

import type { PosDb } from "@/shared/db";

import { IDS } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { hashPin } from "../infrastructure/pin-hasher";
import { verifyPin } from "./verify-pin";

const SALT = btoa("salt-siti");
let db: PosDb;
const deps = (at = "2026-09-25T03:00:00.000Z") => ({ db, now: () => new Date(at) });

beforeEach(async () => {
  db = createTestDb();
  await db.users.add({ id: IDS.cashier, name: "Siti", role: "cashier", pinHash: await hashPin("1234", SALT, 1_000), pinSalt: SALT, pinIterations: 1_000 });
});

describe("verifyPin", () => {
  it("returns the user for the right PIN", async () => {
    expect(await verifyPin({ userId: IDS.cashier, pin: "1234" }, deps())).toEqual({ id: IDS.cashier, name: "Siti", role: "cashier" });
  });

  it("rejects a wrong PIN", async () => {
    await expect(verifyPin({ userId: IDS.cashier, pin: "0000" }, deps())).rejects.toMatchObject({ code: "WRONG_PIN" });
  });

  it("rejects an unknown user", async () => {
    await expect(verifyPin({ userId: IDS.manager, pin: "1234" }, deps())).rejects.toMatchObject({ code: "UNKNOWN_USER" });
  });

  it("locks the device after five wrong PINs, even for the right PIN, and survives a reload", async () => {
    for (let i = 0; i < 5; i++) await verifyPin({ userId: IDS.cashier, pin: "0000" }, deps()).catch(() => undefined);
    await expect(verifyPin({ userId: IDS.cashier, pin: "1234" }, deps("2026-09-25T03:00:30.000Z"))).rejects.toMatchObject({
      code: "PIN_LOCKED",
      details: { lockedUntil: "2026-09-25T03:01:00.000Z" },
    });
  });

  it("unlocks after the lock expires and resets the counter on success", async () => {
    for (let i = 0; i < 5; i++) await verifyPin({ userId: IDS.cashier, pin: "0000" }, deps()).catch(() => undefined);
    await verifyPin({ userId: IDS.cashier, pin: "1234" }, deps("2026-09-25T03:01:00.000Z"));
    expect((await db.syncState.get("pinLockout"))?.value).toEqual({ failures: 0, lockedUntil: null });
  });
});
