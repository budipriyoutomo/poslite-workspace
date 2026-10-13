import { type LucideIcon, Percent, Receipt, TrendingUp, Wallet } from "lucide-react";

import { formatRupiah } from "@/shared/money";
import { Card, CardContent } from "@/shared/ui/card";

interface Totals {
  net: number;
  order_count: number;
  discount: number;
}

function Tile({ label, value, icon: Icon, tone }: { label: string; value: string; icon: LucideIcon; tone: string }) {
  return (
    <Card className="gap-1 py-4 shadow-xs">
      <CardContent className="space-y-3 px-4" aria-label={label}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{label}</p>
          <span aria-hidden className={`flex size-8 items-center justify-center rounded-lg ${tone}`}>
            <Icon className="size-4" />
          </span>
        </div>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

/** One hero figure (revenue) plus three supporting tiles. */
export function StatTiles({ totals }: { totals: Totals }) {
  const average = totals.order_count > 0 ? Math.round(totals.net / totals.order_count) : 0;
  return (
    <section aria-label="Ringkasan" className="grid gap-4 sm:grid-cols-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
      <Card className="relative gap-1 overflow-hidden border-0 bg-gradient-to-br from-emerald-600 to-teal-700 py-5 text-white shadow-lg shadow-emerald-700/20 sm:col-span-3 lg:col-span-1">
        <TrendingUp aria-hidden className="absolute -right-4 -bottom-6 size-32 text-white/10" />
        <CardContent className="relative px-5">
          <p className="text-sm font-medium text-emerald-50/90">Pendapatan</p>
          <output role="status" aria-label="Pendapatan" className="mt-1 block text-4xl font-semibold tracking-tight tabular-nums md:text-5xl">
            {formatRupiah(totals.net)}
          </output>
        </CardContent>
      </Card>
      <Tile label="Transaksi" value={String(totals.order_count)} icon={Receipt} tone="bg-sky-100 text-sky-700" />
      <Tile label="Rata-rata per transaksi" value={formatRupiah(average)} icon={Wallet} tone="bg-violet-100 text-violet-700" />
      <Tile label="Diskon" value={formatRupiah(totals.discount)} icon={Percent} tone="bg-amber-100 text-amber-700" />
    </section>
  );
}
