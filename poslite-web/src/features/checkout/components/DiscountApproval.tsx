"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { verifyPin } from "@/features/auth";
import { getDb, isManager } from "@/shared/db";
import { ApprovalField } from "@/shared/ui/approval-field";

import { copy } from "../copy";

async function isManagerPin(userId: string, pin: string): Promise<boolean> {
  try {
    return isManager((await verifyPin({ userId, pin })).role);
  } catch {
    return false;
  }
}

/** A manager's PIN for a discount over the brand's cashier limit (06 Order rule 5), offline. */
export function DiscountApproval({ approvedBy, onApproved }: { approvedBy: string | null; onApproved: (userId: string) => void }) {
  const approvers = useLiveQuery(async () => (await getDb().users.toArray()).filter((u) => isManager(u.role)).map((u) => ({ id: u.id, name: u.name })), []) ?? [];
  return (
    <div role="group" aria-label="Persetujuan diskon" className="mb-3 space-y-2 rounded-md bg-warning/10 p-3 text-sm">
      <p className="text-warning">{copy.discountNeedsApproval}</p>
      <ApprovalField approvers={approvers} verifyApprover={isManagerPin} approvedBy={approvedBy} onApproved={onApproved} />
    </div>
  );
}
