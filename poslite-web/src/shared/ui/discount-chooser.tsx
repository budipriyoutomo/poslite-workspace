"use client";

import { useState } from "react";

import { formatRupiah } from "@/shared/money";

import { Button } from "./button";
import { Input } from "./input";

export type ChosenDiscount = { type: "percentage" | "fixed"; value: number };

/** False when the brand set no presets and no typed value: the discount button is hidden. */
export const hasDiscountChoices = (policy: { percentages: number[]; amounts: number[]; allowCustom: boolean }): boolean =>
  policy.percentages.length > 0 || policy.amounts.length > 0 || policy.allowCustom;

const overLimit = <span className="ml-1 rounded bg-warning/15 px-1 text-[10px] font-semibold text-warning">PIN</span>;

/**
 * Presets from the brand's discount policy, plus a typed value when the brand allows it. With a
 * `cashierLimit` (the person is a cashier), presets above it are marked: they need a manager's PIN.
 */
export function DiscountChooser({
  percentages,
  amounts,
  allowCustom,
  cashierLimit,
  onChoose,
}: {
  percentages: number[];
  amounts: number[];
  allowCustom: boolean;
  cashierLimit?: { maxPercentage: number; maxAmount: number };
  onChoose: (discount: ChosenDiscount) => void;
}) {
  const [custom, setCustom] = useState("");
  const value = Number(custom);
  return (
    <div className="space-y-3">
      {cashierLimit && (
        <p className="text-xs text-muted-foreground">
          Di atas {cashierLimit.maxPercentage}% atau {formatRupiah(cashierLimit.maxAmount)} per transaksi butuh PIN manajer.
        </p>
      )}
      {percentages.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {percentages.map((p) => (
            <Button key={p} variant="outline" onClick={() => onChoose({ type: "percentage", value: p })}>
              {p}%{cashierLimit && p > cashierLimit.maxPercentage && overLimit}
            </Button>
          ))}
        </div>
      )}
      {amounts.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {amounts.map((a) => (
            <Button key={a} variant="outline" onClick={() => onChoose({ type: "fixed", value: a })}>
              {formatRupiah(a)}
              {cashierLimit && a > cashierLimit.maxAmount && overLimit}
            </Button>
          ))}
        </div>
      )}
      {allowCustom && (
        <div className="flex gap-2">
          <Input aria-label="Diskon lain" inputMode="numeric" placeholder="Nilai lain" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 9))} />
          <Button variant="outline" disabled={value < 1 || value > 100} onClick={() => onChoose({ type: "percentage", value })}>
            Pakai %
          </Button>
          <Button variant="outline" disabled={value < 1} onClick={() => onChoose({ type: "fixed", value })}>
            Pakai Rp
          </Button>
        </div>
      )}
    </div>
  );
}
