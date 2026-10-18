import type { PosDb } from "@/shared/db";

import { buildRefundSlip, buildVoidSlip } from "../domain/correction-slips";
import { RECEIPT_COLUMNS } from "./load-receipt";
import { defaultPrintDeps, type PrintDeps, runPrintJob } from "./print-receipt";

async function slipContext(db: PosDb, userIds: (string | null | undefined)[]) {
  const [outlet, printer, users] = await Promise.all([
    db.settings.get("outlet"),
    db.printers.where("role").equals("receipt").first(),
    db.users.bulkGet(userIds.filter((id): id is string => Boolean(id))),
  ]);
  const nameOf = (id: string | null | undefined) => (id ? (users.find((u) => u?.id === id)?.name ?? "-") : null);
  return { outlet: outlet?.value, columns: RECEIPT_COLUMNS[printer?.paperWidth ?? 58], nameOf };
}

/** Slip for a voided order, printed on the receipt printer (ADR-023). */
export function printVoidSlip(orderId: string, deps: PrintDeps = defaultPrintDeps()): Promise<boolean> {
  return runPrintJob(
    { orderId, documentType: "void_slip" },
    async () => {
      const order = await deps.db.orders.get(orderId);
      if (order?.status !== "voided" || !order.voidedAt) return undefined;
      const [payments, ctx] = await Promise.all([deps.db.payments.where("orderId").equals(orderId).toArray(), slipContext(deps.db, [order.voidedBy, order.voidApprovedBy])]);
      if (!ctx.outlet) return undefined;
      const doc = buildVoidSlip({
        header: ctx.outlet.receiptHeader || (ctx.outlet.brand?.name ?? ""),
        timezone: ctx.outlet.timezone,
        receiptNo: order.receiptNo,
        voidedAt: order.voidedAt,
        voidedBy: ctx.nameOf(order.voidedBy) ?? "-",
        approvedBy: ctx.nameOf(order.voidApprovedBy),
        reason: order.voidReason ?? "",
        lines: order.lines.map((l) => ({ productName: l.productName, quantity: l.quantity, amount: (l.unitPrice + l.modifiers.reduce((s, m) => s + m.price, 0)) * l.quantity })),
        total: order.total,
        paymentMethods: [...new Map(payments.map((p) => [p.methodName, { name: p.methodName, isCash: p.methodType === "cash" }])).values()],
      });
      return { doc, columns: ctx.columns };
    },
    deps,
  );
}

/** Slip for a refund, printed on the receipt printer (ADR-023). */
export async function printRefundSlip(refundId: string, deps: PrintDeps = defaultPrintDeps()): Promise<boolean> {
  const refund = await deps.db.refunds.get(refundId).catch(() => undefined);
  return runPrintJob(
    { orderId: refund?.orderId ?? "", documentType: "refund_slip", refundId },
    async () => {
      if (!refund) return undefined;
      const ctx = await slipContext(deps.db, [refund.refundedBy, refund.approvedBy]);
      if (!ctx.outlet) return undefined;
      const doc = buildRefundSlip({
        header: ctx.outlet.receiptHeader || (ctx.outlet.brand?.name ?? ""),
        timezone: ctx.outlet.timezone,
        refundNo: refund.refundNo,
        receiptNo: refund.receiptNo,
        refundedAt: refund.createdAt,
        refundedBy: ctx.nameOf(refund.refundedBy) ?? "-",
        approvedBy: ctx.nameOf(refund.approvedBy),
        reason: refund.reason,
        lines: refund.lines,
        total: refund.total,
        payments: refund.payments.map((p) => ({ methodName: p.methodName, amount: p.amount, isCash: p.methodType === "cash" })),
      });
      return { doc, columns: ctx.columns };
    },
    deps,
  );
}
