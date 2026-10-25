"use client";

import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { type ApprovalCheck, ApprovalField, type Approver } from "@/shared/ui/approval-field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

import { copy } from "../copy";
import { checkReason, type Reason } from "../domain/void-rules";
import { ReasonField } from "./ReasonField";

/** Cancels the whole order (ADR-023); a cashier needs a manager's PIN. */
export function VoidDialog({
  receiptNo,
  hasNonCash,
  actorIsManager,
  approvers,
  verifyApprover,
  onConfirm,
  onClose,
}: {
  receiptNo: string;
  hasNonCash: boolean;
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
  const canVoid = text !== null && (actorIsManager || approvedBy !== null) && !isSaving;

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
          <DialogTitle>{copy.voidTitle(receiptNo)}</DialogTitle>
          {hasNonCash && <DialogDescription className="text-warning">{copy.nonCashWarning}</DialogDescription>}
        </DialogHeader>
        <ReasonField reason={reason} other={other} onChange={(r, o) => (setReason(r), setOther(o))} />
        {!actorIsManager && <ApprovalField approvers={approvers} verifyApprover={verifyApprover} approvedBy={approvedBy} onApproved={setApprovedBy} />}
        <DialogFooter>
          <Button variant="destructive" className="w-full" disabled={!canVoid} onClick={confirm}>
            {copy.confirmVoid}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
