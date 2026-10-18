"use client";

import { Input } from "@/shared/ui/input";

import { copy } from "../copy";
import { REASONS, type Reason } from "../domain/void-rules";

const selectClass = "h-10 w-full rounded-md border bg-card px-3 text-sm";

export function ReasonField({ reason, other, onChange }: { reason: Reason | ""; other: string; onChange: (reason: Reason | "", other: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm font-medium">
        <span>{copy.reason}</span>
        <select aria-label={copy.reason} className={selectClass} value={reason} onChange={(e) => onChange(e.target.value as Reason | "", other)}>
          <option value="">Pilih alasan</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {reason === "Lainnya" && <Input aria-label={copy.otherReason} maxLength={200} value={other} onChange={(e) => onChange(reason, e.target.value)} />}
    </div>
  );
}
