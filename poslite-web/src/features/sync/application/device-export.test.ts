import { beforeEach, describe, expect, it } from "vitest";

import type { PosDb } from "@/shared/db";

import file from "../../../../tests/fixtures/device-export.json";
import { OUTLET, seedOutlet } from "../../../../tests/support/fixtures";
import { createTestDb } from "../../../../tests/support/test-db";
import { buildDeviceExport } from "./device-export";

let db: PosDb;
const NOW = new Date("2026-10-07T09:12:00.000Z");

beforeEach(async () => {
  db = createTestDb();
  await seedOutlet(db);
  await db.syncState.put({ key: "device", value: { mode: "server", deviceId: OUTLET.deviceId, deviceCode: "A", outletId: OUTLET.outletId, token: "tok" } });
  // Everything still in the outbox — pending, failed or dead — is not on the server yet.
  for (const [i, e] of file.events.entries()) {
    await db.outbox.add({ id: e.id, type: e.type as "shift.opened", aggregateId: e.aggregate_id, occurredAt: e.occurred_at, payload: e.payload, status: i === 3 ? "dead" : "pending", attempts: 0, createdAt: e.occurred_at });
  }
});

describe("buildDeviceExport (ADR-024)", () => {
  it("writes every unsent event with the checksum the server checks (shared fixture)", async () => {
    const { filename, content } = await buildDeviceExport({ db, now: () => NOW });
    const doc = JSON.parse(content);

    expect(filename).toBe("poslite-export-JKT01A-20261007-1612.json"); // outlet time (Asia/Jakarta)
    expect(doc).toMatchObject({ format: "poslite-device-export", version: 1, outlet_id: OUTLET.outletId, device_id: OUTLET.deviceId, device_code: "A", tenant_id: null });
    expect(doc.events).toEqual(file.events);
    expect(doc.checksum).toBe(file.checksum);
  });

  it("keeps the outbox as it is", async () => {
    await buildDeviceExport({ db, now: () => NOW });

    expect(await db.outbox.count()).toBe(4);
  });
});
