"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

import { useOutletChoice, useOutlets, useSelectedOutlet } from "../application/use-outlets";

export function OutletSelect() {
  const outlets = useOutlets();
  const selected = useSelectedOutlet();
  const choose = useOutletChoice((s) => s.choose);
  if (!outlets.data || !selected) return null;
  return (
    <Select value={selected.id} onValueChange={choose}>
      <SelectTrigger aria-label="Outlet" className="w-56 bg-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {outlets.data.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.code} · {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
