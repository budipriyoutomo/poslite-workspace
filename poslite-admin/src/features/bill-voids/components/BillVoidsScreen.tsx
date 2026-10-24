"use client";

import { Download } from "lucide-react";
import { useState } from "react";

import { dateRange } from "@/features/dashboard";
import { useSelectedOutlet } from "@/features/outlets";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

import { useBillVoids } from "../application/use-bill-voids";
import { approverOf, billVoidsCsv, itemsOf, SCOPE_LABEL, voidTime } from "../domain/csv";

function download(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

/** Leakage report (ADR-028): what left an open bill after the kitchen had it, why, and who approved. */
export function BillVoidsScreen() {
  const outlet = useSelectedOutlet();
  const timezone = outlet?.timezone ?? "Asia/Jakarta";
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const current = range ?? dateRange("7d", new Date(), timezone);
  const report = useBillVoids(outlet?.id, current.from, current.to);
  const data = report.data;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Batal sebelum bayar</h1>
        <p className="text-sm text-muted-foreground">Item yang dibatalkan dari bill setelah masuk dapur. Tidak mengurangi penjualan, tapi bahan sudah terpakai.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" aria-label="Dari" className="w-40 bg-card" value={current.from} max={current.to} onChange={(e) => e.target.value && setRange({ ...current, from: e.target.value })} />
        <Input type="date" aria-label="Sampai" className="w-40 bg-card" value={current.to} min={current.from} onChange={(e) => e.target.value && setRange({ ...current, to: e.target.value })} />
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={!data || data.voids.length === 0}
          onClick={() => data && download(billVoidsCsv(data.voids, timezone), `batal-sebelum-bayar-${outlet?.code ?? "outlet"}-${current.from}-${current.to}.csv`)}
        >
          <Download /> CSV
        </Button>
      </div>
      {data && (
        <>
          <output role="status" aria-label="Total batal sebelum bayar" className="block text-lg font-semibold tabular-nums">
            {`${formatRupiah(data.totals.amount)} · ${data.totals.count} kejadian`}
          </output>
          {data.voids.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada item yang dibatalkan setelah masuk dapur.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table aria-label="Batal sebelum bayar" className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    {["Waktu", "Meja", "Jenis", "Item", "Nilai", "Alasan", "Kasir", "Disetujui"].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.voids.map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{voidTime(v.voided_at, timezone)}</td>
                      <td className="px-3 py-2">{v.table_label}</td>
                      <td className="px-3 py-2">{SCOPE_LABEL[v.scope]}</td>
                      <td className="px-3 py-2">{itemsOf(v)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(v.amount)}</td>
                      <td className="px-3 py-2">{v.reason}</td>
                      <td className="px-3 py-2">{v.cashier_name}</td>
                      <td className="px-3 py-2">{approverOf(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
