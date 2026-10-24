import { reconcileSent, type VoidedLine, voidedUnits } from "@/features/cart";
import { checkApproval } from "@/features/orders";
import { getOpenShift } from "@/features/shift";
import { enqueueEvent } from "@/features/sync";
import { getDb, type LineDiscount, type OpenBillLine, type PosDb } from "@/shared/db";
import { AppError } from "@/shared/errors";
import { newId } from "@/shared/id";

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
  newId?: () => string;
}

/** Who takes sent items off a bill, why, and the manager who approved (null = a manager acting alone). */
export interface VoidApproval {
  reason: string;
  actorId: string;
  approvedBy: string | null;
}

const defaultDeps = (): BillDeps => ({ db: getDb(), now: () => new Date(), newId });

const voidTables = (db: PosDb) => [db.openBills, db.users, db.shifts, db.outbox];

/** Queues bill.item_voided (ADR-028) inside the caller's transaction. */
async function recordVoid(
  input: { bill: BillRef; scope: "line" | "bill_cancelled"; voided: VoidedLine[]; approval: VoidApproval | undefined },
  deps: BillDeps,
): Promise<void> {
  const { db } = deps;
  if (!input.approval) throw new AppError("VOID_APPROVAL_REQUIRED");
  await checkApproval(db, input.approval.actorId, input.approval.approvedBy);
  const shift = await getOpenShift(db);
  if (!shift) throw new AppError("NO_OPEN_SHIFT");
  const id = deps.newId ?? newId;
  await enqueueEvent(db, {
    id: id(),
    type: "bill.item_voided",
    aggregateId: id(),
    occurredAt: deps.now().toISOString(),
    payload: {
      bill_id: input.bill.id,
      scope: input.scope,
      table_label: input.bill.tableLabel,
      shift_id: shift.id,
      cashier_id: input.approval.actorId,
      approved_by: input.approval.approvedBy,
      reason: input.approval.reason,
      lines: input.voided.map((v) => ({ product_id: v.productId, product_name: v.name, modifiers: v.modifiers, unit_price: v.unitPrice, quantity: v.quantity, amount: v.amount })),
    },
  });
}

/**
 * Keeps a dine-in order open on this device only (ADR-015). Units the kitchen already had may only
 * leave the bill with an approval, recorded as bill.item_voided (ADR-028); the voided lines are
 * returned for the cancel ticket.
 */
export async function saveBill(
  input: { bill: BillRef; lines: OpenBillLine[]; discount: LineDiscount | null; void?: VoidApproval },
  deps: BillDeps = defaultDeps(),
): Promise<{ voided: VoidedLine[] }> {
  const { db } = deps;
  if (input.lines.length === 0) throw new AppError("EMPTY_BILL");
  return db.transaction("rw", voidTables(db), async () => {
    if (input.bill.tableId) {
      const others = await db.openBills.where("tableId").equals(input.bill.tableId).toArray();
      if (others.some((b) => b.id !== input.bill.id)) throw new AppError("TABLE_OCCUPIED");
    }
    const saved = await db.openBills.get(input.bill.id);
    const voided = saved ? voidedUnits(saved.lines, input.lines) : [];
    if (voided.length > 0) await recordVoid({ bill: input.bill, scope: "line", voided, approval: input.void }, deps);
    const lines = saved ? reconcileSent(saved.lines, input.lines) : input.lines;
    await db.openBills.put({ ...input.bill, lines, discount: input.discount, updatedAt: deps.now().toISOString() });
    return { voided };
  });
}

/** Nothing was paid on an open bill; only what the kitchen already had needs an approved void (ADR-028). */
export async function cancelBill(input: { billId: string; void?: VoidApproval }, deps: BillDeps = defaultDeps()): Promise<{ voided: VoidedLine[] }> {
  const { db } = deps;
  return db.transaction("rw", voidTables(db), async () => {
    const bill = await db.openBills.get(input.billId);
    if (!bill) return { voided: [] };
    const voided = voidedUnits(bill.lines, []);
    if (voided.length > 0) await recordVoid({ bill, scope: "bill_cancelled", voided, approval: input.void }, deps);
    await db.openBills.delete(bill.id);
    return { voided };
  });
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
