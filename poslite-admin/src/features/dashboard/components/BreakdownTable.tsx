import { formatRupiah } from "@/shared/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  amount: number;
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Tunai",
  debit: "Debit",
  qris: "QRIS",
  credit_card: "Kartu kredit",
  voucher: "Voucher",
  other: "Lainnya",
};

export const methodLabel = (type: string) => METHOD_LABEL[type] ?? type;

export function BreakdownTable({ title, countLabel, rows }: { title: string; countLabel: string; rows: BreakdownRow[] }) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada penjualan.</p>
        ) : (
          <table aria-label={title} className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">Nama</th>
                <th className="py-1 text-right font-medium">{countLabel}</th>
                <th className="py-1 text-right font-medium">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="py-1.5">{r.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.count}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums">{formatRupiah(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
