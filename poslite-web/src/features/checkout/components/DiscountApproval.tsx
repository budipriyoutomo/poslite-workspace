"use client";

import { ManagerApproval } from "@/features/auth";

import { copy } from "../copy";

/** A manager's PIN for a discount over the brand's cashier limit (06 Order rule 5), offline. */
export function DiscountApproval({ approvedBy, onApproved }: { approvedBy: string | null; onApproved: (userId: string) => void }) {
  return (
    <div role="group" aria-label="Persetujuan diskon" className="mb-3 space-y-2 rounded-md bg-warning/10 p-3 text-sm">
      <p className="text-warning">{copy.discountNeedsApproval}</p>
      <ManagerApproval approvedBy={approvedBy} onApproved={onApproved} />
    </div>
  );
}
