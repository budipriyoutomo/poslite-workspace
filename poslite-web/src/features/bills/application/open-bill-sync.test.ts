import { beforeEach, describe, expect, it } from "vitest";

import { ApiError, NetworkError } from "@/shared/api";
import type { OpenBillLine, OpenBillRow, PosDb } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import { saveBill } from "./bills";
import { type OpenBillApi, openForEditing, releaseBill, type ServerBill, syncOpenBills } from "./open-bill-sync";

// ADR-031: a table-service outlet shares its open bills through the server. These tests run the
// device side against an in-memory server with the same rules as the API (version, lease).

const ME = "D1";
const NOW = new Date("2026-10-24T05:00:00.000Z");
const LATER = "2026-10-24T05:01:00.000Z";
const teh: OpenBillLine = {
  key: "k1",
  productId: "P1",
  name: "Es Teh",
  categoryName: "Minuman",
  unitPrice: 5_000,
  modifiers: [],
  note: "",
  quantity: 1,
};

class FakeServer implements OpenBillApi {
  bills = new Map<string, ServerBill>();
  isOffline = false;
  calls: string[] = [];

  private guard() {
    if (this.isOffline) throw new NetworkError("offline");
  }

  put(bill: Partial<ServerBill> & { id: string }) {
    this.bills.set(bill.id, {
      table_id: null,
      table_label: "A3",
      lines: [teh],
      discount: null,
      guest_count: null,
      printed_at: null,
      opened_by: "U1",
      opened_at: NOW.toISOString(),
      version: 1,
      lease: null,
      updated_at: NOW.toISOString(),
      ...bill,
    });
  }

  async list() {
    this.guard();
    return [...this.bills.values()];
  }

  async open(input: Parameters<OpenBillApi["open"]>[0]) {
    this.guard();
    this.calls.push(`open ${input.id} release=${input.release_lease}`);
    if ([...this.bills.values()].some((b) => input.table_id && b.table_id === input.table_id)) throw new ApiError(409, "TABLE_OCCUPIED");
    this.put({
      ...input,
      lease: input.release_lease
        ? null
        : {
            device_id: ME,
            device_name: "Kasir 1",
            user_id: input.user_id,
            until: LATER,
          },
    });
    return this.bills.get(input.id)!;
  }

  async save(id: string, input: Parameters<OpenBillApi["save"]>[1]) {
    this.guard();
    this.calls.push(`save ${id} v${input.version} release=${input.release_lease}`);
    const bill = this.bills.get(id);
    if (!bill) throw new ApiError(404, "BILL_NOT_FOUND");
    if (bill.version !== input.version) throw new ApiError(409, "BILL_VERSION_CONFLICT");
    const saved = {
      ...bill,
      table_id: input.table_id,
      table_label: input.table_label,
      lines: input.lines,
      discount: input.discount,
      guest_count: input.guest_count,
      printed_at: input.printed_at,
      version: bill.version + 1,
      lease: input.release_lease ? null : bill.lease,
    };
    this.bills.set(id, saved);
    return saved;
  }

  async lease(id: string, userId: string) {
    this.guard();
    const bill = this.bills.get(id);
    if (!bill) throw new ApiError(404, "BILL_NOT_FOUND");
    if (bill.lease && bill.lease.device_id !== ME) throw new ApiError(409, "BILL_LEASED");
    const leased = {
      ...bill,
      lease: {
        device_id: ME,
        device_name: "Kasir 1",
        user_id: userId,
        until: LATER,
      },
    };
    this.bills.set(id, leased);
    return leased;
  }

  async release(id: string) {
    this.guard();
    this.calls.push(`release ${id}`);
    const bill = this.bills.get(id);
    if (bill?.lease?.device_id === ME) this.bills.set(id, { ...bill, lease: null });
  }

  async cancel(id: string, version: number) {
    this.guard();
    this.calls.push(`cancel ${id} v${version}`);
    this.bills.delete(id);
  }
}

let db: PosDb;
let server: FakeServer;
beforeEach(() => {
  db = createTestDb();
  server = new FakeServer();
});

const deps = (activeBillId: string | null = null) => ({
  db,
  api: server,
  deviceId: ME,
  userId: "U1",
  now: () => NOW,
  activeBillId: () => activeBillId,
});
const ref = (id: string) => ({
  id,
  tableId: null,
  tableLabel: "A3",
  openedBy: "U1",
  openedAt: NOW.toISOString(),
});
const row = (id: string) => db.openBills.get(id) as Promise<OpenBillRow>;

describe("syncOpenBills", () => {
  it("brings the outlet's bills to this device, with who is editing them", async () => {
    server.put({
      id: "B1",
      lease: {
        device_id: "D2",
        device_name: "Pelayan 1",
        user_id: "U2",
        until: LATER,
      },
    });

    await syncOpenBills(deps());

    expect(await row("B1")).toMatchObject({
      origin: "server",
      serverVersion: 1,
      dirty: false,
      lines: [teh],
      leaseUntil: null,
      leaseHolder: { deviceName: "Pelayan 1", userId: "U2", until: LATER },
    });
  });

  it("brings the guests and the printed bill another device recorded (15 · UX-04)", async () => {
    server.put({ id: "B1", guest_count: 4, printed_at: LATER });

    await syncOpenBills(deps());

    expect(await row("B1")).toMatchObject({ guestCount: 4, printedAt: LATER });
  });

  it("uploads the guests and the printed bill recorded here (15 · UX-04)", async () => {
    await saveBill({ bill: { ...ref("B1"), guestCount: 3 }, lines: [teh], discount: null }, { db, now: () => NOW, shared: true });
    await db.openBills.update("B1", { printedAt: LATER });

    await syncOpenBills(deps());

    expect(server.bills.get("B1")).toMatchObject({ guest_count: 3, printed_at: LATER });
  });

  it("drops a bill another device paid or cancelled", async () => {
    server.put({ id: "B1" });
    await syncOpenBills(deps());
    server.bills.clear();

    await syncOpenBills(deps());

    expect(await db.openBills.count()).toBe(0);
  });

  it("uploads a bill opened here and frees it once it left the screen", async () => {
    await saveBill({ bill: ref("B1"), lines: [teh], discount: null }, { db, now: () => NOW, shared: true });

    await syncOpenBills(deps());

    expect(server.calls).toEqual(["open B1 release=true"]);
    expect(await row("B1")).toMatchObject({
      origin: "server",
      serverVersion: 1,
      dirty: false,
    });
  });

  it("saves an edit over the version it was based on and keeps the lease while the bill is in the cart", async () => {
    server.put({ id: "B1" });
    await syncOpenBills(deps());
    await saveBill({ bill: ref("B1"), lines: [{ ...teh, quantity: 3 }], discount: null }, { db, now: () => NOW, shared: true });

    await syncOpenBills(deps("B1"));

    expect(server.calls).toEqual(["save B1 v1 release=false"]);
    expect(server.bills.get("B1")?.lines).toEqual([{ ...teh, quantity: 3 }]);
    expect(await row("B1")).toMatchObject({ serverVersion: 2, dirty: false });
  });

  it("shows a refused offline edit next to the server's bill, never merging it", async () => {
    server.put({ id: "B1" });
    await syncOpenBills(deps());
    await saveBill({ bill: ref("B1"), lines: [{ ...teh, quantity: 3 }], discount: null }, { db, now: () => NOW, shared: true });
    server.put({ id: "B1", version: 2, lines: [{ ...teh, quantity: 5 }] }); // the cashier changed it meanwhile

    await syncOpenBills(deps());

    expect(await row("B1")).toMatchObject({
      serverVersion: 2,
      dirty: false,
      lines: [{ ...teh, quantity: 5 }],
      conflict: { lines: [{ ...teh, quantity: 3 }], at: NOW.toISOString() },
    });
  });

  it("keeps an edit made offline until the server is back", async () => {
    server.put({ id: "B1" });
    await syncOpenBills(deps());
    await saveBill({ bill: ref("B1"), lines: [{ ...teh, quantity: 3 }], discount: null }, { db, now: () => NOW, shared: true });
    server.isOffline = true;

    await syncOpenBills(deps());

    expect(await row("B1")).toMatchObject({
      dirty: true,
      lines: [{ ...teh, quantity: 3 }],
    });
  });

  it("does not bring back a bill this device paid before the payment reached the server", async () => {
    server.put({ id: "B1" });
    await db.outbox.add({
      id: "E1",
      type: "order.placed",
      aggregateId: "O1",
      occurredAt: NOW.toISOString(),
      payload: { closes_bill_id: "B1" },
      status: "pending",
      attempts: 0,
      createdAt: NOW.toISOString(),
    });

    await syncOpenBills(deps());

    expect(await db.openBills.count()).toBe(0);
  });
});

describe("openForEditing", () => {
  it("takes the lease and the latest bill from the server", async () => {
    server.put({ id: "B1" });
    await syncOpenBills(deps());
    server.put({ id: "B1", version: 2, lines: [{ ...teh, quantity: 2 }] });

    const bill = await openForEditing("B1", deps());

    expect(bill).toMatchObject({
      serverVersion: 2,
      leaseUntil: LATER,
      lines: [{ ...teh, quantity: 2 }],
    });
  });

  it("refuses a bill another device is editing", async () => {
    server.put({
      id: "B1",
      lease: {
        device_id: "D2",
        device_name: "Pelayan 1",
        user_id: "U2",
        until: LATER,
      },
    });
    await syncOpenBills(deps());

    await expect(openForEditing("B1", deps())).rejects.toMatchObject({
      code: "BILL_LEASED",
    });
  });

  it("lets this device keep editing offline a bill whose lease it held", async () => {
    server.put({ id: "B1" });
    await syncOpenBills(deps());
    await openForEditing("B1", deps());
    server.isOffline = true;

    await expect(openForEditing("B1", deps())).resolves.toMatchObject({
      id: "B1",
    });
  });

  it("keeps other devices' bills read-only while offline", async () => {
    server.put({ id: "B1" });
    await syncOpenBills(deps());
    server.isOffline = true;

    await expect(openForEditing("B1", deps())).rejects.toMatchObject({
      code: "BILL_OFFLINE",
    });
  });
});

describe("releaseBill", () => {
  it("frees a bill put back unchanged", async () => {
    server.put({ id: "B1" });
    await syncOpenBills(deps());
    await openForEditing("B1", deps());

    await releaseBill("B1", deps());

    expect(server.bills.get("B1")?.lease).toBeNull();
    expect((await row("B1")).leaseUntil).toBeNull();
  });
});
