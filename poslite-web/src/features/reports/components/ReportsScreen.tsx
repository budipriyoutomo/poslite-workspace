"use client";

import { formatRupiah } from "@/shared/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

import { useShiftReport } from "../application/use-shift-report";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function Table({ title, rows }: { title: string; rows: { name: string; amount: number; count: number }[] }) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t">
                <td className="py-1.5">{r.name}</td>
                <td className="text-right text-muted-foreground">{r.count}×</td>
                <td className="text-right font-medium tabular-nums">{formatRupiah(r.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Local report of the current (or last) shift — works offline, straight from IndexedDB. */
export function ReportsScreen() {
  const report = useShiftReport();
  if (report === undefined) return null;
  if (report === null) return <p className="p-6 text-muted-foreground">Belum ada shift.</p>;
  const { shift, summary } = report;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">
        Laporan Shift · {shift.businessDate} {shift.status === "closed" && "(ditutup)"}
      </h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pendapatan" value={formatRupiah(summary.revenue)} />
        <Stat label="Transaksi" value={String(summary.transactions)} />
        <Stat label="Diskon" value={formatRupiah(summary.discount)} />
        <Stat label="Service + PB1" value={formatRupiah(summary.service + summary.tax)} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <Table title="Metode Pembayaran" rows={summary.byPaymentMethod} />
        <Table title="Kategori" rows={summary.byCategory.map((c) => ({ name: c.name, amount: c.amount, count: c.quantity }))} />
        <Table title="Menu" rows={summary.byProduct.map((p) => ({ name: p.name, amount: p.amount, count: p.quantity }))} />
      </div>
    </div>
  );
}
