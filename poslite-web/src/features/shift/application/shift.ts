import { enqueueEvent } from "@/features/sync";
import { AppError } from "@/shared/errors";
import type { OpenBillRow, PosDb, ShiftRow } from "@/shared/db";
import { getDb, readState } from "@/shared/db";
import { newId } from "@/shared/id";

import { businessDate } from "../domain/business-date";
import { closeShiftCash, summarizeShiftCash } from "../domain/shift-cash";

export interface ShiftDeps {
  db: PosDb;
  now: () => Date;
  newId: () => string;
}

const defaultDeps = (): ShiftDeps => ({ db: getDb(), now: () => new Date(), newId });

function assertRupiah(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${what} must be an integer Rupiah >= 0, got ${value}`);
}

export async function getOpenShift(db: PosDb = getDb()): Promise<ShiftRow | undefined> {
  return db.shifts.where("status").equals("open").first();
}

async function requireOpenShift(db: PosDb): Promise<ShiftRow> {
  const shift = await getOpenShift(db);
  if (!shift) throw new AppError("NO_OPEN_SHIFT");
  return shift;
}

/** One device has at most one open shift (06-domain-and-database.md, Shift rule 1). */
export async function openShift(input: { cashierId: string; openingCash: number }, deps: ShiftDeps = defaultDeps()): Promise<ShiftRow> {
  assertRupiah(input.openingCash, "openingCash");
  const { db } = deps;
  return db.transaction("rw", [db.settings, db.shifts, db.outbox], async () => {
    const outlet = (await db.settings.get("outlet"))?.value;
    if (!outlet) throw new AppError("DEVICE_NOT_ACTIVATED");
    if (await getOpenShift(db)) throw new AppError("SHIFT_ALREADY_OPEN");

    const now = deps.now();
    const shift: ShiftRow = {
      id: deps.newId(),
      openedBy: input.cashierId,
      openedAt: now.toISOString(),
      openingCash: input.openingCash,
      businessDate: businessDate(now, outlet.timezone, outlet.businessDayCutoff),
      status: "open",
    };
    await db.shifts.add(shift);
    await enqueueEvent(db, {
      id: deps.newId(),
      type: "shift.opened",
      aggregateId: shift.id,
      occurredAt: shift.openedAt,
      payload: { opening_cash: shift.openingCash, opened_by: shift.openedBy },
    });
    return shift;
  });
}

export async function recordCashMovement(
  input: { type: "in" | "out"; amount: number; reason: string; createdBy: string },
  deps: ShiftDeps = defaultDeps(),
): Promise<void> {
  assertRupiah(input.amount, "amount");
  const { db } = deps;
  await db.transaction("rw", [db.shifts, db.cashMovements, db.outbox], async () => {
    const shift = await requireOpenShift(db);
    const movement = { id: deps.newId(), shiftId: shift.id, ...input, reason: input.reason.trim(), createdAt: deps.now().toISOString() };
    await db.cashMovements.add(movement);
    await enqueueEvent(db, {
      id: deps.newId(),
      type: "cash.moved",
      aggregateId: movement.id,
      occurredAt: movement.createdAt,
      payload: { shift_id: shift.id, type: movement.type, amount: movement.amount, reason: movement.reason, created_by: movement.createdBy },
    });
  });
}

/** Counted cash is recorded against the expected amount; a variance never blocks closing. */
export async function closeShift(input: { closedBy: string; countedCash: number }, deps: ShiftDeps = defaultDeps()): Promise<ShiftRow> {
  const { db } = deps;
  return db.transaction("rw", [db.shifts, db.orders, db.payments, db.refunds, db.cashMovements, db.openBills, db.outbox, db.syncState], async () => {
    const shift = await requireOpenShift(db);
    // Counter: unpaid bills live only here; closing would strand them outside any shift (ADR-015).
    // Table service: bills belong to the outlet; only one this device holds or has not sent blocks (ADR-031 rule 7).
    const isShared = (await readState(db, "serviceMode")) === "table_service";
    const now = deps.now().toISOString();
    const isHeldHere = (b: OpenBillRow) => b.origin !== "server" || b.dirty === true || (b.leaseUntil ?? "") > now;
    if ((await db.openBills.filter((b) => !isShared || isHeldHere(b)).count()) > 0) throw new AppError("OPEN_BILLS");
    const orders = await db.orders.where("shiftId").equals(shift.id).toArray();
    const payments = await db.payments.where("orderId").anyOf(orders.map((o) => o.id)).toArray();
    const movements = await db.cashMovements.where("shiftId").equals(shift.id).toArray();
    const refunds = await db.refunds.where("shiftId").equals(shift.id).toArray(); // ADR-023

    const summary = summarizeShiftCash(
      shift.openingCash,
      orders.map((o) => ({ status: o.status, changeAmount: o.changeAmount, payments: payments.filter((p) => p.orderId === o.id) })),
      movements,
      refunds,
    );
    const { expectedCash, countedCash, variance } = closeShiftCash(summary.expectedCash, input.countedCash);
    const closed: ShiftRow = { ...shift, status: "closed", closedBy: input.closedBy, closedAt: deps.now().toISOString(), expectedCash, countedCash, variance };
    await db.shifts.put(closed);
    await enqueueEvent(db, {
      id: deps.newId(),
      type: "shift.closed",
      aggregateId: shift.id,
      occurredAt: closed.closedAt!,
      payload: { closed_by: input.closedBy, counted_cash: countedCash, expected_cash: expectedCash, variance },
    });
    return closed;
  });
}
