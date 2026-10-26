import { type OpenBillRow, type PosDb, readState, type ServiceMode, writeState } from "@/shared/db";
import { AppError } from "@/shared/errors";

import { type BillDeps, cancelBill, markBillPrinted, moveBill, saveBill, type VoidApproval } from "./bills";
import { cancelOnServer, type OpenBillSyncDeps, openForEditing } from "./open-bill-sync";

/** Something of this device's own that the other mode would strand: a bill only it has, or an unsent edit. */
const isOwn = (bill: OpenBillRow) => bill.origin !== "server" || bill.dirty === true;

/**
 * ADR-031 rule 1: the device works in the outlet's mode once it has no open bill of its own; until
 * then it keeps the old mode and reports the pending one (the POS shows a banner).
 */
export async function resolveServiceMode(db: PosDb): Promise<{ mode: ServiceMode; pending: ServiceMode | null }> {
  return db.transaction("rw", [db.settings, db.openBills, db.syncState], async () => {
    const wanted = (await db.settings.get("outlet"))?.value.serviceMode ?? "counter";
    const current = (await readState(db, "serviceMode")) ?? "counter";
    if (wanted === current) return { mode: current, pending: null };
    if ((await db.openBills.filter(isOwn).count()) > 0) return { mode: current, pending: wanted };
    // Only copies of the server's bills are left: the server keeps them (or, for counter, has none).
    await db.openBills.clear();
    await writeState(db, "serviceMode", wanted);
    return { mode: wanted, pending: null };
  });
}

type SaveInput = Parameters<typeof saveBill>[0];

/** Where open bills live (ADR-031): one port, so the cart and bill screens never ask the mode. */
export interface BillStore {
  isShared: boolean;
  save(input: SaveInput, deps?: BillDeps): ReturnType<typeof saveBill>;
  cancel(input: { billId: string; void?: VoidApproval }): ReturnType<typeof cancelBill>;
  move(input: { billId: string; table: { id: string | null; label: string } }): Promise<void>;
  /** The bill was printed for the guests (15 · UX-04). */
  markPrinted(billId: string): Promise<void>;
}

/** Counter: this device only (ADR-015). */
const localBillStore: BillStore = {
  isShared: false,
  save: (input, deps) => saveBill(input, deps),
  cancel: (input) => cancelBill(input),
  move: (input) => moveBill(input),
  markPrinted: (billId) => markBillPrinted(billId),
};

/** Table service: saved here first (works offline), then sent to the server by the bill sync. */
function serverBillStore(server: () => Promise<OpenBillSyncDeps>): BillStore {
  const shared = async () => {
    const deps = await server();
    return { deps, local: { db: deps.db, now: deps.now, shared: true } };
  };
  return {
    isShared: true,
    save: async (input, deps) => saveBill(input, { ...(deps ?? (await shared()).local), shared: true }),
    cancel: async (input) => {
      const { deps, local } = await shared();
      await cancelOnServer(input.billId, deps);
      return cancelBill(input, local);
    },
    move: async (input) => {
      const { deps, local } = await shared();
      await openForEditing(input.billId, deps); // rule 6: moving needs the bill's lease
      await moveBill(input, local);
    },
    // No lease needed: the save that carries it waits until no other device is editing the bill.
    markPrinted: async (billId) => markBillPrinted(billId, (await shared()).local),
  };
}

const noServer = () => Promise.reject(new AppError("DEVICE_NOT_ACTIVATED"));

export function billStoreFor(mode: ServiceMode, server: () => Promise<OpenBillSyncDeps> = noServer): BillStore {
  return mode === "counter" ? localBillStore : serverBillStore(server);
}
