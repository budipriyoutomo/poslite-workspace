"use client";

import { Input } from "@/shared/ui/input";

import { copy } from "../copy";
import { REASONS, type Reason } from "../domain/void-rules";

const selectClass = "h-10 w-full rounded-md border bg-card px-3 text-sm";

/** A fixed reason, or "Lainnya" with a note. Order corrections use REASONS; other flows pass their own list. */
export function ReasonField<R extends string = Reason>({
  reasons = REASONS as readonly string[] as readonly R[],
  reason,
  other,
  onChange,
}: {
  reasons?: readonly R[];
  reason: R | "";
  other: string;
  onChange: (reason: R | "", other: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-sm font-medium">
        <span>{copy.reason}</span>
        <select aria-label={copy.reason} className={selectClass} value={reason} onChange={(e) => onChange(e.target.value as R | "", other)}>
          <option value="">Pilih alasan</option>
          {reasons.map((r) => (
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
