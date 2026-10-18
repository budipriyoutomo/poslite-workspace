"use client";

import { RotateCcw, XCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/features/auth";
import { printRefundSlip, printVoidSlip } from "@/features/printing";
import { useOpenShift } from "@/features/shift";
import type { OrderRow, PaymentRow, RefundRow } from "@/shared/db";
import { getDb } from "@/shared/db";
import { AppError } from "@/shared/errors";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";

import { localRefundSource, refundOrder, voidOrder } from "../application/correct-order";
import { useApprovers, usePaymentMethods, verifyApprover } from "../application/use-corrections";
import { copy } from "../copy";
import type { RefundSource } from "../domain/refund-plan";
import { voidBlocker } from "../domain/void-rules";
import { RefundDialog, type RefundRequest } from "./RefundDialog";
import { VoidDialog } from "./VoidDialog";

const failed = (e: unknown) => toast.error(e instanceof AppError ? (copy.errors[e.code] ?? e.code) : e instanceof Error ? e.message : String(e));

/** Void / refund of a local order (ADR-023), with the refunds already made on this device. */
export function OrderCorrections({ order, payments, refunds }: { order: OrderRow; payments: PaymentRow[]; refunds: RefundRow[] }) {
  const user = useSession((s) => s.user);
  const shift = useOpenShift();
  const [dialog, setDialog] = useState<"void" | { source: RefundSource } | null>(null);
  const approvers = useApprovers();
  const methods = usePaymentMethods();
  if (!user) return null;
  const actorIsManager = user.role !== "cashier";
  const canVoid = voidBlocker({ status: order.status, deviceId: "here", shiftId: order.shiftId }, { deviceId: "here", openShiftId: shift?.id ?? null, refunded: refunds.length > 0 }) === null;

  const confirmVoid = async (input: { reason: string; approvedBy: string | null }) => {
    try {
      await voidOrder({ orderId: order.id, actorId: user.id, ...input });
      toast.success(copy.voided);
      setDialog(null);
      if (!(await printVoidSlip(order.id))) toast.error(copy.slipPrintFailed);
    } catch (e) {
      failed(e);
    }
  };
  const confirmRefund = async (source: RefundSource, request: RefundRequest) => {
    try {
      const refund = await refundOrder({ source, actorId: user.id, ...request });
      toast.success(copy.refunded(refund.refundNo));
      setDialog(null);
      if (!(await printRefundSlip(refund.id))) toast.error(copy.slipPrintFailed);
    } catch (e) {
      failed(e);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={!canVoid} onClick={() => setDialog("void")}>
          <XCircle /> {copy.void}
        </Button>
        <Button variant="outline" disabled={order.status === "voided" || !shift} onClick={async () => setDialog({ source: await localRefundSource(getDb(), order.id) })}>
          <RotateCcw /> {copy.refund}
        </Button>
      </div>
      {refunds.map((r) => (
        <p key={r.id} className="flex justify-between text-sm">
          <span className="font-mono">{r.refundNo}</span>
          <span className="tabular-nums">−{formatRupiah(r.total)}</span>
        </p>
      ))}
      {dialog === "void" && (
        <VoidDialog
          receiptNo={order.receiptNo}
          hasNonCash={payments.some((p) => p.methodType !== "cash")}
          actorIsManager={actorIsManager}
          approvers={approvers}
          verifyApprover={verifyApprover}
          onConfirm={confirmVoid}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog !== null && dialog !== "void" && (
        <RefundDialog
          source={dialog.source}
          methods={methods}
          defaultMethodId={payments[0]?.paymentMethodId ?? methods[0]?.id ?? ""}
          actorIsManager={actorIsManager}
          approvers={approvers}
          verifyApprover={verifyApprover}
          onConfirm={(request) => confirmRefund(dialog.source, request)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
