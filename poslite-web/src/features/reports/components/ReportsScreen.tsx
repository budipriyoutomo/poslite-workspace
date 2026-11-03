"use client";

import { useSession } from "@/features/auth";
import { isManager } from "@/shared/db";
import { formatRupiah } from "@/shared/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

import { useShiftReport } from "../application/use-shift-report";
import { copy } from "../copy";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent role="group" aria-label={label} className="px-4">
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
        <table aria-label={title} className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t">
                <td className="py-1.5">{r.name}</td>
                <td className="px-2 text-right whitespace-nowrap text-muted-foreground">{r.count}×</td>
                <td className="text-right font-medium whitespace-nowrap tabular-nums">{formatRupiah(r.amount)}</td>
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
  const user = useSession((s) => s.user);
  if (report === undefined) return null;
  if (report === null) return <p className="p-6 text-muted-foreground">{copy.noShift}</p>;
  const { shift, summary, prePaymentVoids } = report;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold">{copy.title(shift.businessDate, shift.status === "closed")}</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={copy.totalTaken} value={formatRupiah(summary.revenue)} />
        <Stat label={copy.netSales} value={formatRupiah(summary.netSales)} />
        <Stat label={copy.transactions} value={String(summary.transactions)} />
        <Stat label={copy.discount} value={formatRupiah(summary.discount)} />
        <Stat label={copy.service} value={formatRupiah(summary.service)} />
        <Stat label={copy.tax} value={formatRupiah(summary.tax)} />
      </div>
      {isManager(user?.role) && prePaymentVoids.count > 0 && (
        <p role="status" aria-label={copy.prePaymentVoids} className="text-sm text-muted-foreground">
          {copy.prePaymentVoids}: {copy.voidSummary(prePaymentVoids.count, formatRupiah(prePaymentVoids.amount))}
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <Table title={copy.byPaymentMethod} rows={summary.byPaymentMethod} />
        <Table title={copy.byChannel} rows={summary.byChannel} />
        <Table title={copy.byCategory} rows={summary.byCategory.map((c) => ({ name: c.name, amount: c.amount, count: c.quantity }))} />
        <Table title={copy.byProduct} rows={summary.byProduct.map((p) => ({ name: p.name, amount: p.amount, count: p.quantity }))} />
      </div>
    </div>
  );
}
