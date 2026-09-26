"use client";

import { useState } from "react";
import { toast } from "sonner";

import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { RupiahInput } from "@/shared/ui/rupiah-input";
import { Switch } from "@/shared/ui/switch";
import { TableCell, TableRow } from "@/shared/ui/table";

import type { OutletPrice, OutletPriceIn } from "../application/use-outlet-prices";

export function PriceRow({ row, isSaving, onSave }: { row: OutletPrice; isSaving: boolean; onSave: (body: OutletPriceIn) => Promise<unknown> }) {
  const [price, setPrice] = useState(row.price);
  const save = (body: OutletPriceIn) => onSave(body).catch(() => toast.error(`Gagal menyimpan ${row.name}`));

  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{formatRupiah(row.base_price)}</TableCell>
      <TableCell className="w-48">
        <RupiahInput aria-label={`Harga di outlet ${row.name}`} placeholder="Harga dasar" value={price} onValueChange={setPrice} />
      </TableCell>
      <TableCell className="w-24 text-center">
        <Switch aria-label={`Tersedia ${row.name}`} checked={row.is_available} disabled={isSaving} onCheckedChange={(checked) => save({ price: row.price, is_available: checked })} />
      </TableCell>
      <TableCell className="w-24 text-right">
        <Button size="sm" variant="outline" disabled={price === row.price || isSaving} onClick={() => save({ price, is_available: row.is_available })}>
          Simpan
        </Button>
      </TableCell>
    </TableRow>
  );
}
