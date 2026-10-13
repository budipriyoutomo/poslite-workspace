"use client";

import { Delete } from "lucide-react";

import { type CashKey, formatRupiah, pressCashKey } from "@/shared/money";

import { Button } from "./button";

const KEYS: { key: CashKey; label: string }[] = [
  ..."123456789".split("").map((d) => ({ key: d as CashKey, label: d })),
  { key: "000", label: "000" },
  { key: "0", label: "0" },
  { key: "00", label: "00" },
];

/** Integer-Rupiah amount entry for touch screens (no decimal key — ADR-005). */
export function MoneyKeypad({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between rounded-lg border bg-white px-4 py-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <output role="status" aria-label={label} className="text-2xl font-bold tabular-nums">
          {formatRupiah(value)}
        </output>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <div className="col-span-3 grid grid-cols-3 gap-2">
          {KEYS.map(({ key, label: text }) => (
            <Button key={key} type="button" variant="outline" className="h-12 text-lg [@media(max-height:760px)]:h-10" onClick={() => onChange(pressCashKey(value, key))}>
              {text}
            </Button>
          ))}
        </div>
        <div className="grid gap-2">
          <Button type="button" variant="outline" className="h-full" aria-label="Hapus digit" onClick={() => onChange(pressCashKey(value, "backspace"))}>
            <Delete />
          </Button>
          <Button type="button" variant="outline" className="h-full text-red-600" onClick={() => onChange(pressCashKey(value, "clear"))}>
            C
          </Button>
        </div>
      </div>
    </div>
  );
}
