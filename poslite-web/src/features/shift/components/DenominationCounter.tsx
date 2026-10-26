"use client";

import { formatRupiah } from "@/shared/money";
import { Input } from "@/shared/ui/input";

import { copy } from "../copy";
import { COINS, countedTotal, NOTES } from "../domain/shift-cash";

type Count = Record<number, number>;

const digits = (text: string) => Number(text.replace(/\D/g, "").slice(0, 9) || "0");

function Row({ label, ariaLabel, value, amount, onChange }: { label: string; ariaLabel: string; value: number; amount: number; onChange: (n: number) => void }) {
  return (
    <div className="grid grid-cols-[1fr_6rem_7rem] items-center gap-2 text-sm">
      <span className="font-medium">{label}</span>
      <Input aria-label={ariaLabel} inputMode="numeric" autoComplete="off" className="h-11 text-right tabular-nums" value={value ? String(value) : ""} onChange={(e) => onChange(digits(e.target.value))} />
      <span className="text-right tabular-nums text-muted-foreground">{formatRupiah(amount)}</span>
    </div>
  );
}

/** Blind-close count (15 · UX-02): pieces per note, the coins as one total; the sum is shown live. */
export function DenominationCounter({ value, onChange }: { value: Count; onChange: (value: Count) => void }) {
  const set = (denomination: number, pieces: number) => onChange({ ...value, [denomination]: pieces });
  return (
    <div className="space-y-2">
      {NOTES.map((note) => (
        <Row key={note} label={formatRupiah(note)} ariaLabel={copy.notePieces(formatRupiah(note))} value={value[note] ?? 0} amount={note * (value[note] ?? 0)} onChange={(n) => set(note, n)} />
      ))}
      <Row label={copy.coins} ariaLabel={copy.coinsTotal} value={value[COINS] ?? 0} amount={value[COINS] ?? 0} onChange={(n) => set(COINS, n)} />
      <p role="status" aria-label={copy.countedTotal} className="flex justify-between border-t pt-2 font-semibold">
        <span>{copy.countedTotal}</span>
        <span className="tabular-nums">{formatRupiah(countedTotal(value))}</span>
      </p>
    </div>
  );
}
