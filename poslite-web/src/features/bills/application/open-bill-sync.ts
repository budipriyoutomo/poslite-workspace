import { ApiError, NetworkError } from "@/shared/api";
import type { OpenBillRow, PosDb } from "@/shared/db";
import { AppError } from "@/shared/errors";

import type { BillBody, OpenBillApi, ServerBill } from "../infrastructure/open-bill-http";

export type { OpenBillApi, ServerBill };

// ADR-031: at a table-service outlet the server keeps the open bills. Each device holds a copy in
// openBills; a change is made locally first (so it works offline), then saved over the server
// version it was based on. One device edits a bill at a time (a lease); a refused save is shown
// to the user next to the server's bill, never merged.

export interface OpenBillSyncDeps {
  db: PosDb;
  api: OpenBillApi;
  deviceId: string;
  /** Who works on this device now (the lease is in their name). */
  userId: string;
  now: () => Date;
  /** The bill in the cart right now: this device keeps its lease. */
  activeBillId: () => string | null;
}

/** The server's bill as this device keeps it (clean, nothing of its own pending). */
function fromServer(bill: ServerBill, deviceId: string, conflict: OpenBillRow["conflict"] = null): OpenBillRow {
  const lease = bill.lease;
  const isMine = lease?.device_id === deviceId;
  return {
    id: bill.id,
    tableId: bill.table_id,
    tableLabel: bill.table_label,
    lines: bill.lines,
    discount: bill.discount,
    openedBy: bill.opened_by,
    openedAt: bill.opened_at,
    updatedAt: bill.updated_at,
    origin: "server",
    serverVersion: bill.version,
    dirty: false,
    leaseUntil: isMine ? lease.until : null,
    leaseHolder:
      lease && !isMine
        ? {
            deviceName: lease.device_name,
            userId: lease.user_id,
            until: lease.until,
          }
        : null,
    conflict,
  };
}

const errorCode = (e: unknown) => (e instanceof ApiError ? e.code : null);

/** Bills this device paid whose order.placed has not reached the server yet. */
async function closingHere(db: PosDb): Promise<Set<string>> {
  const events = await db.outbox.filter((e) => e.type === "order.placed").toArray();
  return new Set(
    events.flatMap((e) => ((e.payload as { closes_bill_id?: string }).closes_bill_id ? [(e.payload as { closes_bill_id: string }).closes_bill_id] : [])),
  );
}

function body(row: OpenBillRow, deps: OpenBillSyncDeps): BillBody {
  return {
    table_id: row.tableId,
    table_label: row.tableLabel,
    lines: row.lines,
    discount: row.discount,
    user_id: deps.userId,
    release_lease: deps.activeBillId() !== row.id,
  };
}

/** After an upload: the server's version and lease, keeping what changed here meanwhile. */
async function uploaded(db: PosDb, sent: OpenBillRow, saved: ServerBill, deviceId: string): Promise<void> {
  await db.transaction("rw", db.openBills, async () => {
    const current = await db.openBills.get(sent.id);
    if (!current) return; // paid or cancelled here meanwhile
    const isUnchanged = current.updatedAt === sent.updatedAt;
    const server = fromServer(saved, deviceId, current.conflict ?? null);
    await db.openBills.put({
      ...current,
      origin: "server",
      serverVersion: saved.version,
      dirty: !isUnchanged,
      leaseUntil: server.leaseUntil,
      leaseHolder: null,
    });
  });
}

/** Sends this device's new and changed bills. False when the server cannot be reached. */
async function upload(deps: OpenBillSyncDeps): Promise<boolean> {
  const { db } = deps;
  const pending = await db.openBills.filter((b) => (b.origin !== "server" && !b.conflict) || (b.origin === "server" && b.dirty === true)).toArray();
  for (const row of pending) {
    try {
      const saved =
        row.origin === "server"
          ? await deps.api.save(row.id, {
              ...body(row, deps),
              version: row.serverVersion ?? 0,
            })
          : await deps.api.open({
              ...body(row, deps),
              id: row.id,
              opened_by: row.openedBy,
              opened_at: row.openedAt,
            });
      await uploaded(db, row, saved, deps.deviceId);
    } catch (e) {
      if (e instanceof NetworkError) return false;
      const code = errorCode(e);
      if (code === "BILL_LEASED") continue; // another device is editing: try again next round
      // Another device changed (or closed) the bill, or took the table: keep this edit beside it.
      if (code === "BILL_VERSION_CONFLICT" || code === "TABLE_OCCUPIED" || code === "BILL_NOT_FOUND") {
        await db.openBills.update(row.id, {
          dirty: false,
          conflict: { lines: row.lines, at: deps.now().toISOString() },
        });
        continue;
      }
      throw e;
    }
  }
  return true;
}

/** Brings the copies here in line with the server's open bills. */
async function download(deps: OpenBillSyncDeps): Promise<void> {
  const { db } = deps;
  const bills = await deps.api.list();
  const closing = await closingHere(db);
  await db.transaction("rw", [db.openBills, db.outbox], async () => {
    const onServer = new Set(bills.map((b) => b.id));
    for (const bill of bills) {
      if (closing.has(bill.id)) continue;
      const local = await db.openBills.get(bill.id);
      const fresh = fromServer(bill, deps.deviceId, local?.conflict ?? null);
      // An edit of this device still on its way wins locally; only who is editing changes.
      if (local && (local.dirty || local.origin !== "server")) await db.openBills.update(bill.id, { leaseHolder: fresh.leaseHolder });
      else await db.openBills.put(fresh);
    }
    const gone = await db.openBills.filter((b) => b.origin === "server" && !b.dirty && !onServer.has(b.id)).primaryKeys();
    await db.openBills.bulkDelete(gone);
  });
}

/** One round (every few seconds while online): upload this device's changes, then download. */
export async function syncOpenBills(deps: OpenBillSyncDeps): Promise<void> {
  if (!(await upload(deps))) return;
  try {
    await download(deps);
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
  }
}

/**
 * Takes a bill for editing (ADR-031 rule 3): the lease and the server's latest bill. Offline, only
 * a bill this device opened or held the lease of may be edited (rule 4); others stay read-only.
 */
export async function openForEditing(billId: string, deps: OpenBillSyncDeps): Promise<OpenBillRow> {
  const { db } = deps;
  const row = await db.openBills.get(billId);
  if (!row) throw new AppError("BILL_NOT_FOUND");
  if (row.origin !== "server") return row;
  let leased: ServerBill;
  try {
    leased = await deps.api.lease(billId, deps.userId);
  } catch (e) {
    if (e instanceof NetworkError) {
      if (row.leaseUntil) return row;
      throw new AppError("BILL_OFFLINE");
    }
    const code = errorCode(e);
    if (code === "BILL_LEASED" || code === "BILL_NOT_FOUND") throw new AppError(code);
    throw e;
  }
  return db.transaction("rw", db.openBills, async () => {
    const current = (await db.openBills.get(billId)) ?? row;
    // This device's offline edit over the version it was based on: keep it, it saves next round.
    const isOwnEdit = current.dirty === true && current.serverVersion === leased.version;
    const next = isOwnEdit
      ? {
          ...current,
          leaseUntil: leased.lease?.until ?? null,
          leaseHolder: null,
        }
      : fromServer(leased, deps.deviceId, current.dirty ? { lines: current.lines, at: deps.now().toISOString() } : (current.conflict ?? null));
    await db.openBills.put(next);
    return next;
  });
}

/** Keeps the lease while the bill stays on screen; offline it simply runs out. */
export async function renewLease(billId: string, deps: OpenBillSyncDeps): Promise<void> {
  try {
    const leased = await deps.api.lease(billId, deps.userId);
    await deps.db.openBills.update(billId, {
      leaseUntil: leased.lease?.until ?? null,
    });
  } catch {
    // offline or taken over after expiry: the next save says so
  }
}

/** The bill left the screen unchanged: another device may take it at once. */
export async function releaseBill(billId: string, deps: OpenBillSyncDeps): Promise<void> {
  const row = await deps.db.openBills.get(billId);
  if (row?.origin !== "server" || row.dirty) return; // a pending save releases it
  try {
    await deps.api.release(billId);
    await deps.db.openBills.update(billId, { leaseUntil: null });
  } catch {
    // offline: the lease runs out by itself
  }
}

/** Cancelling a shared bill needs the server (it may be open on another device). */
export async function cancelOnServer(billId: string, deps: Pick<OpenBillSyncDeps, "db" | "api">): Promise<void> {
  const row = await deps.db.openBills.get(billId);
  if (row?.origin !== "server") return;
  try {
    await deps.api.cancel(billId, row.serverVersion ?? 0);
  } catch (e) {
    if (e instanceof NetworkError) throw new AppError("BILL_OFFLINE");
    const code = errorCode(e);
    if (code === "BILL_NOT_FOUND") return; // already gone
    if (code) throw new AppError(code);
    throw e;
  }
}
