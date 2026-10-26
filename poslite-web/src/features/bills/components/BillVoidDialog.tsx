"use client";

import { TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { VoidedLine } from "@/features/cart";
import { checkReason, ReasonField } from "@/features/orders";
import { formatRupiah } from "@/shared/money";
import { type ApprovalCheck, ApprovalField, type Approver } from "@/shared/ui/approval-field";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

import { copy } from "../copy";
import { BILL_VOID_REASONS, type BillVoidReason } from "../domain/void-reasons";

/** "bill": the whole table is cancelled · "line": sent units are taken off while saving. */
export type VoidScope = "bill" | "line";

function title(scope: VoidScope, tableLabel: string, voided: VoidedLine[]): string {
  if (scope === "bill") return copy.voidBillTitle(tableLabel);
  const [only] = voided;
  return voided.length === 1 && only ? copy.voidLineTitle(only.quantity, only.name) : copy.voidTitle(tableLabel);
}

/**
 * Items the kitchen already had leave a bill only with a reason and a manager's PIN (ADR-028). The
 * dialog says what went out, who is recorded and what follows before anyone confirms (15 · UX-05).
 */
export function BillVoidDialog({
  scope,
  tableLabel,
  cashierName,
  voided,
  actorIsManager,
  approvers,
  verifyApprover,
  onConfirm,
  onClose,
}: {
  scope: VoidScope;
  tableLabel: string;
  cashierName: string;
  voided: VoidedLine[];
  actorIsManager: boolean;
  approvers: Approver[];
  verifyApprover: ApprovalCheck;
  onConfirm: (input: { reason: string; approvedBy: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<BillVoidReason | "">("");
  const [other, setOther] = useState("");
  const [approvedBy, setApprovedBy] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const text = reason ? checkReason(reason, other) : null;
  const canConfirm = text !== null && (actorIsManager || approvedBy !== null) && !isSaving;
  const items = voided.reduce((n, v) => n + v.quantity, 0);
  const value = formatRupiah(voided.reduce((sum, v) => sum + v.amount, 0));

  const confirm = async () => {
    if (!text) return;
    setIsSaving(true);
    try {
      await onConfirm({ reason: text, approvedBy: actorIsManager ? null : approvedBy });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent mobileSheet className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title(scope, tableLabel, voided)}</DialogTitle>
          <DialogDescription>{copy.voidHint}</DialogDescription>
        </DialogHeader>
        <div role="note" className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium">{copy.voidSent(items, value)}</p>
            <p>{copy.voidRecordedAs(cashierName)}</p>
            <p className="text-muted-foreground">{copy.voidConsequences}</p>
          </div>
        </div>
        <ul className="space-y-1 text-sm">
          {voided.map((v) => (
            <li key={v.key} className="flex justify-between gap-2">
              <span>{`${v.quantity}x ${v.name}`}</span>
              <span className="tabular-nums">{formatRupiah(v.amount)}</span>
            </li>
          ))}
        </ul>
        <ReasonField reasons={BILL_VOID_REASONS} reason={reason} other={other} onChange={(r, o) => (setReason(r), setOther(o))} />
        {!actorIsManager && <ApprovalField approvers={approvers} verifyApprover={verifyApprover} approvedBy={approvedBy} onApproved={setApprovedBy} />}
        <DialogFooter>
          <Button variant="destructive" className="w-full" disabled={!canConfirm} onClick={confirm}>
            {scope === "bill" ? copy.confirmVoidBill(value) : copy.confirmVoid(value)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
