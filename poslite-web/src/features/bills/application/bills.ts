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

/**
 * Moves an open bill to another table — local only, like the bill itself (ADR-015). Other
 * devices do not know which tables this one uses; only this device's bills are checked.
 */
export async function moveBill(input: { billId: string; table: { id: string | null; label: string } }, deps: BillDeps = defaultDeps()): Promise<void> {
  const { db } = deps;
  await db.transaction("rw", db.openBills, async () => {
    const bill = await db.openBills.get(input.billId);
    if (!bill) throw new AppError("BILL_NOT_FOUND");
    const same = input.table.id !== null ? bill.tableId === input.table.id : bill.tableLabel === input.table.label;
    if (same) throw new AppError("SAME_TABLE");
    if (input.table.id !== null && (await db.openBills.where("tableId").equals(input.table.id).count()) > 0) throw new AppError("TABLE_OCCUPIED");
    await db.openBills.update(bill.id, { tableId: input.table.id, tableLabel: input.table.label, updatedAt: deps.now().toISOString() });
  });
}
