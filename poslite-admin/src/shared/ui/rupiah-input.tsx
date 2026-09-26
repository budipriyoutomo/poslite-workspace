"use client";

import type { ComponentProps } from "react";

import { Input } from "./input";

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Integer Rupiah entry: digits only (no decimals — ADR-005), shown with dot separators. */
export function RupiahInput({
  value,
  onValueChange,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & { value: number | null; onValueChange: (value: number | null) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        className="pl-9 tabular-nums"
        value={value === null ? "" : group(String(value))}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 12);
          onValueChange(digits === "" ? null : Number(digits));
        }}
      />
    </div>
  );
}
