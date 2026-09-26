"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/shared/ui/button";

interface Props {
  lines: { key: string; name: string; quantity: number }[];
  take: Record<string, number>;
  onChange: (take: Record<string, number>) => void;
}

/** Split bill by item: how many units of each line this guest pays now (06 "Open Bill & Split"). */
export function SplitPicker({ lines, take, onChange }: Props) {
  const set = (key: string, qty: number) => onChange({ ...take, [key]: qty });
  return (
    <ul className="divide-y text-sm">
      {lines.map((l) => {
        const qty = take[l.key] ?? 0;
        return (
          <li key={l.key} className="flex items-center gap-2 py-2">
            <span className="flex-1 font-medium">{l.name}</span>
            <Button size="icon-sm" variant="outline" aria-label={`Kurangi ${l.name} dibayar`} disabled={qty === 0} onClick={() => set(l.key, qty - 1)}>
              <Minus />
            </Button>
            <span aria-label={`${l.name} dibayar`} className="w-12 text-center tabular-nums">
              {qty} / {l.quantity}
            </span>
            <Button size="icon-sm" variant="outline" aria-label={`Tambah ${l.name} dibayar`} disabled={qty === l.quantity} onClick={() => set(l.key, qty + 1)}>
              <Plus />
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Semua ${l.name}`} onClick={() => set(l.key, l.quantity)}>
              Semua
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
