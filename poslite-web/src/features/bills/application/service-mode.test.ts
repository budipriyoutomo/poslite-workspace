import { beforeEach, describe, expect, it } from "vitest";

import { type OpenBillRow, type PosDb, readState, type ServiceMode } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import { billStoreFor, resolveServiceMode } from "./service-mode";

let db: PosDb;
beforeEach(() => {
  db = createTestDb();
});

const outletIn = (serviceMode: ServiceMode) =>
  db.settings.put({
    key: "outlet",
    value: {
      outletId: "O1",
      outletCode: "JKT01",
      outletName: "Kemang",
      deviceId: "D1",
      deviceCode: "A",
      timezone: "Asia/Jakarta",
      businessDayCutoff: "04:00",
      serviceBps: 0,
      taxBps: 0,
      receiptHeader: "",
      receiptFooter: "",
      serviceMode,
    },
  });
const bill = (id: string, extra: Partial<OpenBillRow> = {}): OpenBillRow => ({
  id,
  tableId: null,
  tableLabel: "A1",
  lines: [],
  discount: null,
  openedBy: "U1",
  openedAt: "2026-10-24",
  updatedAt: "2026-10-24",
  origin: "local",
  ...extra,
});

describe("resolveServiceMode (ADR-031 rule 1)", () => {
  it("follows the outlet's mode when the device has no open bill", async () => {
    await outletIn("table_service");

    expect(await resolveServiceMode(db)).toEqual({
      mode: "table_service",
      pending: null,
    });
    expect(await readState(db, "serviceMode")).toBe("table_service");
  });

  it("keeps the old mode while a bill of this device is open", async () => {
    await outletIn("table_service");
    await db.openBills.put(bill("B1"));

    expect(await resolveServiceMode(db)).toEqual({
      mode: "counter",
      pending: "table_service",
    });
  });

  it("drops the copies of the server's bills when going back to counter", async () => {
    await outletIn("table_service");
    await resolveServiceMode(db);
    await db.openBills.put(bill("B1", { origin: "server", serverVersion: 1 }));
    await outletIn("counter");

    expect(await resolveServiceMode(db)).toEqual({
      mode: "counter",
      pending: null,
    });
    expect(await db.openBills.count()).toBe(0);
  });

  it("waits for an edit that has not reached the server yet", async () => {
    await outletIn("table_service");
    await resolveServiceMode(db);
    await db.openBills.put(bill("B1", { origin: "server", serverVersion: 1, dirty: true }));
    await outletIn("counter");

    expect(await resolveServiceMode(db)).toEqual({
      mode: "table_service",
      pending: "counter",
    });
  });
});

describe("billStoreFor", () => {
  it("keeps a counter outlet's bills on this device only", () => {
    expect(billStoreFor("counter").isShared).toBe(false);
  });

  it("shares a table-service outlet's bills through the server", () => {
    expect(billStoreFor("table_service").isShared).toBe(true);
  });
});
