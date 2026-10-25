"use client";

import { useState } from "react";

import type { VoidedLine } from "@/features/cart";
import { checkReason, type Reason, ReasonField } from "@/features/orders";
import { formatRupiah } from "@/shared/money";
import { type ApprovalCheck, ApprovalField, type Approver } from "@/shared/ui/approval-field";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

import { copy } from "../copy";

/** Items the kitchen already had leave a bill only with a reason and a manager's PIN (ADR-028). */
export function BillVoidDialog({
  tableLabel,
  voided,
  actorIsManager,
  approvers,
  verifyApprover,
  onConfirm,
  onClose,
}: {
  tableLabel: string;
  voided: VoidedLine[];
  actorIsManager: boolean;
  approvers: Approver[];
  verifyApprover: ApprovalCheck;
  onConfirm: (input: { reason: string; approvedBy: string | null }) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<Reason | "">("");
  const [other, setOther] = useState("");
  const [approvedBy, setApprovedBy] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const text = reason ? checkReason(reason, other) : null;
  const canConfirm = text !== null && (actorIsManager || approvedBy !== null) && !isSaving;

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
          <DialogTitle>{copy.voidTitle(tableLabel)}</DialogTitle>
          <DialogDescription>{copy.voidHint}</DialogDescription>
        </DialogHeader>
        <ul className="space-y-1 text-sm">
          {voided.map((v) => (
            <li key={v.key} className="flex justify-between gap-2">
              <span>{`${v.quantity}x ${v.name}`}</span>
              <span className="tabular-nums">{formatRupiah(v.amount)}</span>
            </li>
          ))}
        </ul>
        <ReasonField reason={reason} other={other} onChange={(r, o) => (setReason(r), setOther(o))} />
        {!actorIsManager && <ApprovalField approvers={approvers} verifyApprover={verifyApprover} approvedBy={approvedBy} onApproved={setApprovedBy} />}
        <DialogFooter>
          <Button variant="destructive" className="w-full" disabled={!canConfirm} onClick={confirm}>
            {copy.confirmVoid}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
