"use client";

import { AlertTriangle, Download, RotateCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useActiveBrand, usePageAccess } from "@/features/auth";
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

type Scope = "outlet" | "brand" | "company";

export function DashboardScreen() {
  const api = useApi();
  const outlet = useSelectedOutlet();
  const brand = useActiveBrand();
  const { company } = usePageAccess();
  const [scope, setScope] = useState<Scope>("outlet");
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const timezone = outlet?.timezone ?? "Asia/Jakarta";
  const current = range ?? dateRange("7d", new Date(), timezone);
  const scopes: { scope: Scope; label: string }[] = [
    { scope: "outlet", label: outlet ? `Outlet ${outlet.name}` : "Outlet" },
    { scope: "brand", label: "Semua outlet brand" },
    ...(company ? [{ scope: "company" as const, label: "Seluruh perusahaan" }] : []),
  ];
  // Without ids the API reports every outlet in the user's scope: the whole company here.
  const query =
    scope === "company" ? { ...current } : scope === "brand" ? (brand ? { brandId: brand.id, ...current } : null) : outlet ? { outletId: outlet.id, ...current } : null;
  const summary = useSalesSummary(query);
  const data = summary.data;

  const exportAs = (format: "csv" | "xlsx") => query && downloadReport(api, query, format).catch(() => toast.error("Export gagal, coba lagi"));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Ringkasan penjualan</h1>
        <p className="text-sm text-muted-foreground">Pantau pendapatan, menu terlaris, dan kinerja kasir.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Cakupan laporan">
        {scopes.map(({ scope: s, label }) => (
          <Button key={s} variant={scope === s ? "default" : "outline"} size="sm" aria-pressed={scope === s} onClick={() => setScope(s)}>
            {label}
          </Button>
        ))}
      </div>
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
        <Input type="date" aria-label="Dari" className="w-40 bg-card" value={current.from} max={current.to} onChange={(e) => e.target.value && setRange({ ...current, from: e.target.value })} />
        <Input type="date" aria-label="Sampai" className="w-40 bg-card" value={current.to} min={current.from} onChange={(e) => e.target.value && setRange({ ...current, to: e.target.value })} />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" disabled={!query} onClick={() => exportAs("csv")}>
            <Download /> CSV
          </Button>
          <Button variant="outline" size="sm" disabled={!query} onClick={() => exportAs("xlsx")}>
            <Download /> Excel
          </Button>
        </div>
      </div>
      {summary.isError && !data && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <p className="mr-auto">Laporan gagal dimuat. Periksa koneksi lalu coba lagi.</p>
          <Button variant="outline" size="sm" onClick={() => summary.refetch()}>
            <RotateCw /> Coba lagi
          </Button>
        </div>
      )}
      {!data && !summary.isError && query && <DashboardSkeleton />}
      {data && (
        <div className={cn("space-y-6 transition-opacity", summary.isPlaceholderData && "opacity-60")}>
          <StatTiles totals={data.totals} />
          <div className="rounded-xl border bg-card p-4 shadow-xs md:p-5">
            <DailyRevenueChart from={current.from} to={current.to} days={data.days} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <BreakdownTable title="Menu terlaris" countLabel="Qty" rows={data.products.map((p) => ({ key: p.product_id, label: p.product_name, count: p.quantity, amount: p.gross }))} />
            <BreakdownTable title="Kategori" countLabel="Qty" rows={data.categories.map((c) => ({ key: c.category_name, label: c.category_name, count: c.quantity, amount: c.gross }))} />
            <BreakdownTable title="Metode pembayaran" countLabel="Transaksi" rows={data.payment_methods.map((m) => ({ key: m.payment_method_id, label: methodLabel(m.method_type), count: m.count, amount: m.amount }))} />
            <BreakdownTable title="Kasir" countLabel="Transaksi" rows={data.cashiers.map((c) => ({ key: c.cashier_id, label: c.cashier_name, count: c.order_count, amount: c.net }))} />
            <BreakdownTable title="Channel" countLabel="Transaksi" rows={data.channels.map((c) => ({ key: c.channel_id, label: c.channel_name, count: c.order_count, amount: c.net }))} />
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat laporan" className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={cn("animate-pulse rounded-xl border bg-card p-5", i === 0 ? "h-32" : "h-24 lg:h-32")}>
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-4 h-7 w-2/3 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border bg-card" />
    </div>
  );
}
