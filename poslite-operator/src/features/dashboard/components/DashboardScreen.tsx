"use client";

import Link from "next/link";

import { formatRupiah } from "@/shared/money";

import { useSummary } from "../application/use-summary";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p aria-label={label} className="mt-1 text-2xl font-bold tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function DashboardScreen() {
  const summary = useSummary();
  const s = summary.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Ringkasan Platform</h1>
        <p className="text-sm text-muted-foreground">
          Kondisi semua tenant saat ini. Detail per tenant ada di{" "}
          <Link href="/tenants" className="text-blue-700 hover:underline">
            Tenant
          </Link>
          .
        </p>
      </div>
      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total tenant" value={String(s.tenants)} hint={`${s.active_tenants} aktif`} />
            <Stat label="Ditangguhkan" value={String(s.suspended_tenants)} />
            <Stat label="Outlet aktif" value={String(s.outlets)} />
            <Stat label="Perangkat aktif" value={String(s.devices)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Masa coba" value={String(s.trialing)} />
            <Stat label="Berlangganan" value={String(s.paying)} />
            <Stat label="Menunggak" value={String(s.past_due)} />
            <Stat label="Pendapatan bulanan (MRR)" value={formatRupiah(s.monthly_recurring_revenue)} hint="Tagihan terakhir tiap langganan aktif" />
            <Stat label="Tagihan belum dibayar" value={formatRupiah(s.open_invoice_amount)} />
          </div>
        </>
      )}
    </div>
  );
}
