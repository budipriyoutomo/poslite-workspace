"use client";

import { Checkbox } from "@/shared/ui/checkbox";

/** A scrollable list of checkboxes; `prefix` makes each accessible name unique ("Produk Kopi"). */
export function CheckList({ legend, prefix, items, selected, onChange }: { legend: string; prefix: string; items: { id: string; name: string }[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
        {items.length === 0 && <p className="text-xs text-muted-foreground">Belum ada.</p>}
        {items.map((item) => (
          <label key={item.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              aria-label={`${prefix} ${item.name}`}
              checked={selected.includes(item.id)}
              onCheckedChange={(on) => onChange(on ? [...selected, item.id] : selected.filter((i) => i !== item.id))}
            />
            {item.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
