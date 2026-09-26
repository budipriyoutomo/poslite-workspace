import { getDb, type LineDiscount, type OpenBillLine, type PosDb } from "@/shared/db";
import { AppError } from "@/shared/errors";

export interface BillRef {
  id: string;
  tableId: string | null;
  tableLabel: string;
  openedBy: string;
  openedAt: string;
}

export interface BillDeps {
  db: PosDb;
  now: () => Date;
}

const defaultDeps = (): BillDeps => ({ db: getDb(), now: () => new Date() });

/** Keeps a dine-in order open on this device only — no outbox, no server (ADR-015). */
export async function saveBill(input: { bill: BillRef; lines: OpenBillLine[]; discount: LineDiscount | null }, deps: BillDeps = defaultDeps()): Promise<void> {
  const { db } = deps;
  if (input.lines.length === 0) throw new AppError("EMPTY_BILL");
  await db.transaction("rw", db.openBills, async () => {
    if (input.bill.tableId) {
      const others = await db.openBills.where("tableId").equals(input.bill.tableId).toArray();
      if (others.some((b) => b.id !== input.bill.id)) throw new AppError("TABLE_OCCUPIED");
    }
    await db.openBills.put({ ...input.bill, lines: input.lines, discount: input.discount, updatedAt: deps.now().toISOString() });
  });
}

/** Nothing was paid on an open bill, so dropping it needs no event. */
export async function cancelBill(id: string, deps: BillDeps = defaultDeps()): Promise<void> {
  await deps.db.openBills.delete(id);
}
