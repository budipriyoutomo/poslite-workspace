"use client";

import { useState } from "react";

import { Button } from "./button";
import { Input } from "./input";

const copy = {
  approver: "Manajer yang menyetujui",
  approverPin: "PIN manajer",
  approve: "Setujui",
  approved: (name: string) => `Disetujui ${name}`,
  wrongPin: "PIN salah",
};

export interface Approver {
  id: string;
  name: string;
}

const selectClass = "h-10 w-full rounded-md border bg-card px-3 text-sm";

/** true approves; false or a message (e.g. the PIN lockout) refuses. */
export type ApprovalCheck = (userId: string, pin: string) => Promise<boolean | string>;

/** A manager confirms with their PIN on this device, offline (voids, refunds, big discounts). */
export function ApprovalField({
  approvers,
  verifyApprover,
  approvedBy,
  onApproved,
}: {
  approvers: Approver[];
  verifyApprover: ApprovalCheck;
  approvedBy: string | null;
  onApproved: (userId: string) => void;
}) {
  const [userId, setUserId] = useState(approvers[0]?.id ?? "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const approver = approvers.find((a) => a.id === approvedBy);
  if (approver) return <p className="text-sm font-medium text-success">{copy.approved(approver.name)}</p>;

  const approve = async () => {
    setError(null);
    const result = await verifyApprover(userId, pin);
    if (result === true) onApproved(userId);
    else setError(result || copy.wrongPin);
    setPin("");
  };

  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{copy.approver}</legend>
      <select aria-label={copy.approver} className={selectClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
        {approvers.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Input aria-label={copy.approverPin} type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        <Button type="button" variant="outline" disabled={pin.length < 4 || !userId} onClick={approve}>
          {copy.approve}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}
