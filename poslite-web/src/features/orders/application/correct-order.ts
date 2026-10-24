import { businessDate, getOpenShift } from "@/features/shift";
import { enqueueEvent } from "@/features/sync";
import type { PosDb, RefundRow } from "@/shared/db";
import { getDb, readState, writeState } from "@/shared/db";
import { AppError } from "@/shared/errors";
import { newId } from "@/shared/id";
import { discountAmount } from "@/shared/money";

import { formatRefundNo, nextReceiptCounter } from "../domain/receipt-number";
import { planRefund, type RefundSource } from "../domain/refund-plan";
import { voidBlocker } from "../domain/void-rules";

export interface CorrectionDeps {
  db: PosDb;
  now: () => Date;
  newId: () => string;
}

const defaultDeps = (): CorrectionDeps => ({ db: getDb(), now: () => new Date(), newId });

/**
 * A cashier needs a manager's PIN for a void, refund or bill void (ADR-028); a manager or owner acts alone
 * (approvedBy null). The approver must be a manager or owner known to this device.
 */
export async function checkApproval(db: PosDb, actorId: string, approvedBy: string | null): Promise<void> {
  const actor = await db.users.get(actorId);
  if (approvedBy === null) {
    if (actor && actor.role !== "cashier") return;
    throw new AppError("APPROVAL_REQUIRED");
  }
  const approver = await db.users.get(approvedBy);
  if (!approver || approver.role === "cashier") throw new AppError("APPROVER_NOT_ALLOWED");
}

/** Cancels a whole order of this device while its shift is open (ADR-023), offline. */
export async function voidOrder(
  input: { orderId: string; reason: string; actorId: string; approvedBy: string | null },
  deps: CorrectionDeps = defaultDeps(),
): Promise<void> {
  const { db } = deps;
  await db.transaction("rw", [db.orders, db.refunds, db.shifts, db.users, db.settings, db.outbox], async () => {
    const order = await db.orders.get(input.orderId);
    const outlet = (await db.settings.get("outlet"))?.value;
    if (!order || !outlet) throw new AppError("ORDER_NOT_FOUND");
    const blocker = voidBlocker(
      { status: order.status, deviceId: outlet.deviceId, shiftId: order.shiftId }, // local orders are this device's
      { deviceId: outlet.deviceId, openShiftId: (await getOpenShift(db))?.id ?? null, refunded: (await db.refunds.where("orderId").equals(order.id).count()) > 0 },
    );
    if (blocker) throw new AppError(blocker);
    await checkApproval(db, input.actorId, input.approvedBy);

    const at = deps.now().toISOString();
    await db.orders.update(order.id, { status: "voided", voidedAt: at, voidReason: input.reason, voidedBy: input.actorId, voidApprovedBy: input.approvedBy });
    await enqueueEvent(db, {
      id: deps.newId(),
      type: "order.voided",
      aggregateId: order.id,
      occurredAt: at,
      payload: { reason: input.reason, voided_by: input.actorId, approved_by: input.approvedBy },
    });
  });
}

/** A local order of this device with what was refunded of it here (≤ 30 days of history). */
export async function localRefundSource(db: PosDb, orderId: string): Promise<RefundSource> {
  const order = await db.orders.get(orderId);
  if (!order) throw new AppError("ORDER_NOT_FOUND");
  const refunded = new Map<string, number>();
  for (const refund of await db.refunds.where("orderId").equals(orderId).toArray()) {
    for (const line of refund.lines) refunded.set(line.orderLineId, (refunded.get(line.orderLineId) ?? 0) + line.quantity);
  }
  return {
    orderId: order.id,
    receiptNo: order.receiptNo,
    total: order.total,
    discountAmount: order.discountAmount,
    lines: order.lines.map((l) => {
      const gross = (l.unitPrice + l.modifiers.reduce((s, m) => s + m.price, 0)) * l.quantity;
      return { id: l.id, productName: l.productName, quantity: l.quantity, gross, lineDiscount: discountAmount(gross, l.discount), refunded: refunded.get(l.id) ?? 0 };
    }),
  };
}

/**
 * Pays back some or all of an order from today's drawer (ADR-023): a new document with its own
 * number, recorded on the open shift and today's business date, then queued as order.refunded.
 */
export async function refundOrder(
  input: { source: RefundSource; picks: Record<string, number>; paymentMethodId: string; reason: string; actorId: string; approvedBy: string | null },
  deps: CorrectionDeps = defaultDeps(),
): Promise<RefundRow> {
  const { db } = deps;
  return db.transaction("rw", [db.orders, db.refunds, db.shifts, db.users, db.settings, db.paymentMethods, db.syncState, db.outbox], async () => {
    const outlet = (await db.settings.get("outlet"))?.value;
    if (!outlet) throw new AppError("DEVICE_NOT_ACTIVATED");
    const shift = await getOpenShift(db);
    if (!shift) throw new AppError("NO_OPEN_SHIFT");
    await checkApproval(db, input.actorId, input.approvedBy);
    const method = await db.paymentMethods.get(input.paymentMethodId);
    if (!method) throw new AppError("UNKNOWN_PAYMENT_METHOD");

    // Local orders: re-read what this device refunded already, inside the transaction.
    const source = (await db.orders.get(input.source.orderId)) ? await localRefundSource(db, input.source.orderId) : input.source;
    const plan = planRefund(source, input.picks);
    if (plan.lines.length === 0) throw new AppError("NOTHING_TO_REFUND");

    const now = deps.now();
    const date = businessDate(now, outlet.timezone, outlet.businessDayCutoff);
    const counter = nextReceiptCounter(await readState(db, "refundCounter"), date);
    await writeState(db, "refundCounter", counter);
    const refund: RefundRow = {
      id: deps.newId(),
      orderId: source.orderId,
      receiptNo: source.receiptNo,
      shiftId: shift.id,
      refundNo: formatRefundNo({ outletCode: outlet.outletCode, deviceCode: outlet.deviceCode, businessDate: date, seq: counter.seq }),
      businessDate: date,
      reason: input.reason,
      refundedBy: input.actorId,
      approvedBy: input.approvedBy,
      lines: plan.lines,
      total: plan.total,
      payments: [{ id: deps.newId(), paymentMethodId: method.id, methodType: method.type, methodName: method.name, amount: plan.total, reference: null }],
      syncStatus: "pending",
      flags: [],
      createdAt: now.toISOString(),
    };
    await db.refunds.add(refund);
    await enqueueEvent(db, {
      id: deps.newId(),
      type: "order.refunded",
      aggregateId: refund.id,
      occurredAt: refund.createdAt,
      payload: {
        order_id: refund.orderId,
        shift_id: refund.shiftId,
        refund_no: refund.refundNo,
        reason: refund.reason,
        refunded_by: refund.refundedBy,
        approved_by: refund.approvedBy,
        lines: refund.lines.map((l) => ({ order_line_id: l.orderLineId, quantity: l.quantity, amount: l.amount })),
        total: refund.total,
        payments: refund.payments.map((p) => ({ id: p.id, payment_method_id: p.paymentMethodId, method_type: p.methodType, method_name: p.methodName, amount: p.amount, reference: p.reference })),
      },
    });
    return refund;
  });
}
