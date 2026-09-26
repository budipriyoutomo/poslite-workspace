import { formatRupiah } from "@/shared/money";
import { Card, CardContent } from "@/shared/ui/card";

interface Totals {
  net: number;
  order_count: number;
  discount: number;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4" aria-label={label}>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

/** One hero figure (revenue) plus three supporting tiles. */
export function StatTiles({ totals }: { totals: Totals }) {
  const average = totals.order_count > 0 ? Math.round(totals.net / totals.order_count) : 0;
  return (
    <section aria-label="Ringkasan" className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr]">
      <Card className="gap-1 py-5">
        <CardContent className="px-5">
          <p className="text-sm text-muted-foreground">Pendapatan</p>
          <output role="status" aria-label="Pendapatan" className="block text-5xl font-semibold tracking-tight">
            {formatRupiah(totals.net)}
          </output>
        </CardContent>
      </Card>
      <Tile label="Transaksi" value={String(totals.order_count)} />
      <Tile label="Rata-rata per transaksi" value={formatRupiah(average)} />
      <Tile label="Diskon" value={formatRupiah(totals.discount)} />
    </section>
  );
}
