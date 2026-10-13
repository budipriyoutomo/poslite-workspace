"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { verifyPin } from "@/features/auth";
import { getDb } from "@/shared/db";
import { ApprovalField } from "@/shared/ui/approval-field";

import { copy } from "../copy";

async function isManagerPin(userId: string, pin: string): Promise<boolean> {
  try {
    return (await verifyPin({ userId, pin })).role !== "cashier";
  } catch {
    return false;
  }
}

/** A manager's PIN for a discount over the brand's cashier limit (06 Order rule 5), offline. */
export function DiscountApproval({ approvedBy, onApproved }: { approvedBy: string | null; onApproved: (userId: string) => void }) {
  const approvers = useLiveQuery(async () => (await getDb().users.toArray()).filter((u) => u.role !== "cashier").map((u) => ({ id: u.id, name: u.name })), []) ?? [];
  return (
    <div role="group" aria-label="Persetujuan diskon" className="mb-3 space-y-2 rounded-md bg-amber-50 p-3 text-sm">
      <p className="text-amber-800">{copy.discountNeedsApproval}</p>
      <ApprovalField approvers={approvers} verifyApprover={isManagerPin} approvedBy={approvedBy} onApproved={onApproved} />
    </div>
  );
}
