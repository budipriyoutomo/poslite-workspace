"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { type ApprovalCheck, ApprovalField, type Approver } from "@/shared/ui/approval-field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

import { copy } from "../copy";
import { planRefund, type RefundSource } from "../domain/refund-plan";
import { checkReason, type Reason } from "../domain/void-rules";
import { ReasonField } from "./ReasonField";

const selectClass = "h-10 w-full rounded-md border bg-card px-3 text-sm";

export interface RefundRequest {
  picks: Record<string, number>;
  paymentMethodId: string;
  reason: string;
  approvedBy: string | null;
}

/** Choose units per line (never more than is left); amounts come from the shared allocation. */
export function RefundDialog({
  source,
  methods,
  defaultMethodId,
  actorIsManager,
  approvers,
  verifyApprover,
  onConfirm,
  onClose,
}: {
  source: RefundSource;
  methods: { id: string; name: string }[];
  defaultMethodId: string;
  actorIsManager: boolean;
  approvers: Approver[];
  verifyApprover: ApprovalCheck;
  onConfirm: (request: RefundRequest) => Promise<void>;
  onClose: () => void;
}) {
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [methodId, setMethodId] = useState(defaultMethodId);
  const [reason, setReason] = useState<Reason | "">("");
  const [other, setOther] = useState("");
  const [approvedBy, setApprovedBy] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const plan = planRefund(source, picks);
  const text = reason ? checkReason(reason, other) : null;
  const canRefund = plan.lines.length > 0 && text !== null && (actorIsManager || approvedBy !== null) && !isSaving;
  const step = (lineId: string, by: number) => setPicks((p) => ({ ...p, [lineId]: (p[lineId] ?? 0) + by }));

  const confirm = async () => {
    if (!text) return;
    setIsSaving(true);
    try {
      await onConfirm({ picks: Object.fromEntries(Object.entries(picks).filter(([, q]) => q > 0)), paymentMethodId: methodId, reason: text, approvedBy: actorIsManager ? null : approvedBy });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent mobileSheet className="max-h-[95dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.refundTitle(source.receiptNo)}</DialogTitle>
          <DialogDescription>{copy.nonCashWarning}</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-md border">
          {source.lines.map((line) => {
            const left = line.quantity - line.refunded;
            const picked = picks[line.id] ?? 0;
            return (
              <li key={line.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1">
                  {line.productName} <span className="text-muted-foreground">({copy.left(left)})</span>
                </span>
                <Button type="button" size="icon" variant="outline" aria-label={`Kurangi ${line.productName}`} disabled={picked === 0} onClick={() => step(line.id, -1)}>
                  <Minus />
                </Button>
                <span aria-label={copy.quantityOf(line.productName)} className="w-6 text-center tabular-nums">
                  {picked}
                </span>
                <Button type="button" size="icon" variant="outline" aria-label={`Tambah ${line.productName}`} disabled={picked >= left} onClick={() => step(line.id, 1)}>
                  <Plus />
                </Button>
              </li>
            );
          })}
        </ul>
        <label className="block space-y-1 text-sm font-medium">
          <span>{copy.refundMethod}</span>
          <select aria-label={copy.refundMethod} className={selectClass} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <ReasonField reason={reason} other={other} onChange={(r, o) => (setReason(r), setOther(o))} />
        {!actorIsManager && <ApprovalField approvers={approvers} verifyApprover={verifyApprover} approvedBy={approvedBy} onApproved={setApprovedBy} />}
        <DialogFooter>
          <Button className="w-full" disabled={!canRefund} onClick={confirm}>
            {copy.confirmRefund(formatRupiah(plan.total))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
