"use client";

import { useSelectedOutlet } from "@/features/outlets";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/shared/ui/table";

import { useOutletPrices, useSetOutletPrice } from "../application/use-outlet-prices";
import { PriceRow } from "./PriceRow";

export function PricesScreen() {
  const outlet = useSelectedOutlet();
  const prices = useOutletPrices(outlet?.id);
  const setPrice = useSetOutletPrice(outlet?.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Harga Outlet</h1>
        <p className="text-sm text-muted-foreground">
          {outlet ? `Harga dan ketersediaan di ${outlet.name}. Kosongkan harga untuk memakai harga dasar.` : "Belum ada outlet."}
        </p>
      </div>
      {prices.data && (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produk</TableHead>
                <TableHead className="text-right">Harga dasar</TableHead>
                <TableHead>Harga di outlet</TableHead>
                <TableHead className="text-center">Tersedia</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {prices.data.map((row) => (
                <PriceRow
                  key={`${row.product_id}:${row.price}`}
                  row={row}
                  isSaving={setPrice.isPending && setPrice.variables?.productId === row.product_id}
                  onSave={(body) => setPrice.mutateAsync({ productId: row.product_id, body })}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
