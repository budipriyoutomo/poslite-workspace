"use client";

import { useState } from "react";
import { toast } from "@/shared/ui/toast";

import { useSession } from "@/features/auth";
import type { VoidedLine } from "@/features/cart";
import { useApprovers, verifyApprover } from "@/features/orders";
import { isManager } from "@/shared/db";
import { AppError } from "@/shared/errors";

import type { VoidApproval } from "../application/bills";
import { sendVoidToKitchen } from "../application/kitchen";
import { copy } from "../copy";
import { BillVoidDialog, type VoidScope } from "./BillVoidDialog";

interface Pending {
  scope: VoidScope;
  billId: string;
  tableLabel: string;
  voided: VoidedLine[];
  /** Saves or cancels the bill with the approval; returns what was voided. */
  run: (approval: VoidApproval) => Promise<{ voided: VoidedLine[] }>;
}

/** Asks for a reason and a manager's PIN, then prints the BATAL ticket (ADR-028). */
export function useBillVoid() {
  const user = useSession((s) => s.user);
  const approvers = useApprovers();
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = async ({ reason, approvedBy }: { reason: string; approvedBy: string | null }) => {
    if (!pending || !user) return;
    try {
      const { voided } = await pending.run({ reason, actorId: user.id, approvedBy });
      setPending(null);
      toast.success(copy.voided(voided.reduce((n, v) => n + v.quantity, 0)));
      const approverName = approvedBy ? (approvers.find((a) => a.id === approvedBy)?.name ?? null) : user.name;
      const bill = { id: pending.billId, tableLabel: pending.tableLabel };
      void sendVoidToKitchen({ bill, voided, cashierName: user.name, reason, approverName }).then(({ hasFailed }) => hasFailed && toast.error(copy.voidPrintFailed));
    } catch (e) {
      toast.error(e instanceof AppError ? (copy.errors[e.code] ?? e.code) : String(e));
    }
  };

  const dialog =
    pending && user ? (
      <BillVoidDialog
        scope={pending.scope}
        tableLabel={pending.tableLabel}
        cashierName={user.name}
        voided={pending.voided}
        actorIsManager={isManager(user.role)}
        approvers={approvers}
        verifyApprover={verifyApprover}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    ) : null;
  return { ask: setPending, dialog };
}
