"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useSelectedOutlet } from "@/features/outlets";
import { useApi } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/ui/utils";

import { downloadReport, useSalesSummary } from "../application/use-sales-summary";
import { dateRange, type Preset } from "../domain/range";
import { BreakdownTable, methodLabel } from "./BreakdownTable";
import { DailyRevenueChart } from "./DailyRevenueChart";
import { StatTiles } from "./StatTiles";

const PRESETS: { preset: Preset; label: string }[] = [
  { preset: "today", label: "Hari ini" },
  { preset: "7d", label: "7 hari" },
  { preset: "30d", label: "30 hari" },
];

export function DashboardScreen() {
  const api = useApi();
  const outlet = useSelectedOutlet();
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const timezone = outlet?.timezone ?? "Asia/Jakarta";
  const current = range ?? dateRange("7d", new Date(), timezone);
  const query = outlet ? { outletId: outlet.id, ...current } : null;
  const summary = useSalesSummary(query);
  const data = summary.data;

  const exportAs = (format: "csv" | "xlsx") => query && downloadReport(api, query, format).catch(() => toast.error("Export gagal, coba lagi"));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map(({ preset, label }) => {
          const r = dateRange(preset, new Date(), timezone);
          const isActive = r.from === current.from && r.to === current.to;
          return (
            <Button key={preset} variant={isActive ? "default" : "outline"} size="sm" onClick={() => setRange(r)}>
              {label}
            </Button>
          );
        })}
        <Input type="date" aria-label="Dari" className="w-40 bg-white" value={current.from} max={current.to} onChange={(e) => e.target.value && setRange({ ...current, from: e.target.value })} />
        <Input type="date" aria-label="Sampai" className="w-40 bg-white" value={current.to} min={current.from} onChange={(e) => e.target.value && setRange({ ...current, to: e.target.value })} />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={!query} onClick={() => exportAs("csv")}>
            <Download /> CSV
          </Button>
          <Button variant="outline" size="sm" disabled={!query} onClick={() => exportAs("xlsx")}>
            <Download /> Excel
          </Button>
        </div>
      </div>
      {data && (
        <div className={cn("space-y-6 transition-opacity", summary.isPlaceholderData && "opacity-60")}>
          <StatTiles totals={data.totals} />
          <div className="rounded-xl border bg-white p-4">
            <DailyRevenueChart from={current.from} to={current.to} days={data.days} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownTable title="Menu terlaris" countLabel="Qty" rows={data.products.map((p) => ({ key: p.product_id, label: p.product_name, count: p.quantity, amount: p.gross }))} />
            <BreakdownTable title="Kategori" countLabel="Qty" rows={data.categories.map((c) => ({ key: c.category_name, label: c.category_name, count: c.quantity, amount: c.gross }))} />
            <BreakdownTable title="Metode pembayaran" countLabel="Transaksi" rows={data.payment_methods.map((m) => ({ key: m.payment_method_id, label: methodLabel(m.method_type), count: m.count, amount: m.amount }))} />
            <BreakdownTable title="Kasir" countLabel="Transaksi" rows={data.cashiers.map((c) => ({ key: c.cashier_id, label: c.cashier_name, count: c.order_count, amount: c.net }))} />
          </div>
        </div>
      )}
    </div>
  );
}
