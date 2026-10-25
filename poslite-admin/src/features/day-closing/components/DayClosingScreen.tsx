"use client";

import { AlertTriangle, CalendarCheck, CheckCircle2, Clock, Printer, RotateCw } from "lucide-react";
import { useState } from "react";

import { businessDate, methodLabel } from "@/features/dashboard";
import { useSelectedOutlet } from "@/features/outlets";
import { formatRupiah } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/ui/utils";

import { type DaySnapshot, useDayClosings, useDayStatus } from "../application/use-day-closing";
import { addDays, dateTime, longDate } from "../domain/dates";
import { CloseDayDialog } from "./CloseDayDialog";
import { ShiftTable } from "./ShiftTable";

/** Back-office "Tutup Hari" (ADR-026): review one outlet's business day, then freeze it. */
export function DayClosingScreen() {
  const outlet = useSelectedOutlet();
  const timezone = outlet?.timezone ?? "Asia/Jakarta";
  const today = businessDate(new Date(), timezone);
  const [day, setDay] = useState<string | null>(null);
  const selected = day ?? addDays(today, -1);
  const status = useDayStatus(outlet?.id, selected);
  const history = useDayClosings(outlet?.id, addDays(today, -13), today);
  const [closing, setClosing] = useState(false);
  const data = status.data;
  const shown = data?.closing?.snapshot ?? data?.current;

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Tutup hari</h1>
        <p className="text-sm text-muted-foreground print:hidden">Periksa penjualan dan kas semua shift, lalu bekukan angka hari itu sebagai rekap setoran.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Input type="date" aria-label="Tanggal operasional" className="w-44 bg-card" value={selected} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
        {history.data && history.data.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Sudah ditutup">
            {history.data.map((c) => (
              <Button key={c.id} size="sm" variant={c.business_date === selected ? "default" : "outline"} onClick={() => setDay(c.business_date)}>
                <CheckCircle2 /> {c.business_date.slice(8)}/{c.business_date.slice(5, 7)}
              </Button>
            ))}
          </div>
        )}
      </div>

      {status.isError && !data && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-destructive" />
          <p className="mr-auto">Data hari ini gagal dimuat. Periksa koneksi lalu coba lagi.</p>
          <Button variant="outline" size="sm" onClick={() => status.refetch()}>
            <RotateCw /> Coba lagi
          </Button>
        </div>
      )}

      {data && shown && (
        <div className={cn("space-y-4 transition-opacity", status.isPlaceholderData && "opacity-60")}>
          <Card className="shadow-xs">
            <CardContent className="flex flex-wrap items-center gap-3">
              <div className="mr-auto space-y-1">
                <p className="font-semibold">
                  {outlet?.name} · {longDate(data.business_date)}
                </p>
                {data.closing ? (
                  <p className="text-sm text-muted-foreground">
                    Ditutup oleh {data.closing.closed_by_name} · {dateTime(data.closing.closed_at, timezone)}
                    {data.closing.notes && <> · “{data.closing.notes}”</>}
                  </p>
                ) : data.day_ended ? (
                  <Badge variant="outline">Belum ditutup</Badge>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="size-4" /> Hari operasional belum berakhir — bisa ditutup setelah jam tutup buku hari berikutnya.
                  </p>
                )}
              </div>
              <div className="flex gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer /> Cetak
                </Button>
                {!data.closing && (
                  <Button size="sm" disabled={!data.day_ended} onClick={() => setClosing(true)}>
                    <CalendarCheck /> Tutup hari
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {data.changed_since_close && (
            <div role="alert" className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
              <AlertTriangle className="size-5 shrink-0 text-amber-600" />
              <p>
                Ada data masuk setelah hari ditutup (sync terlambat atau refund). Angka di bawah adalah snapshot saat tutup hari; penjualan bersih terkini{" "}
                <strong className="tabular-nums">{formatRupiah(data.current.totals.net)}</strong>, kas terhitung terkini <strong className="tabular-nums">{formatRupiah(data.current.cash.counted_cash)}</strong>.
              </p>
            </div>
          )}

          <Warnings snapshot={shown} timezone={timezone} />
          <Summary snapshot={shown} />
          {outlet && <ShiftTable outletId={outlet.id} businessDate={data.business_date} timezone={timezone} />}

          {outlet && (
            <CloseDayDialog open={closing} onOpenChange={setClosing} outletId={outlet.id} businessDate={data.business_date} warnings={data.current.warnings.length > 0} />
          )}
        </div>
      )}
    </div>
  );
}

function Warnings({ snapshot, timezone }: { snapshot: DaySnapshot; timezone: string }) {
  if (snapshot.warnings.length === 0) return null;
  return (
    <ul className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
      {snapshot.warnings.map((w) => (
        <li key={w.code} className="flex gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          {w.code === "OPEN_SHIFTS" ? (
            <span>{w.count} shift masih terbuka — kas shift itu belum dihitung.</span>
          ) : (
            <span>
              Perangkat belum sync sejak hari berakhir, mungkin masih menyimpan transaksi:{" "}
              {w.devices?.map((d) => `${d.name} (${d.last_seen_at ? dateTime(d.last_seen_at, timezone) : "belum pernah"})`).join(", ")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value, strong, status }: { label: string; value: number | string; strong?: boolean; status?: boolean }) {
  const text = typeof value === "number" ? formatRupiah(value) : value;
  return (
    <div className={cn("flex items-baseline justify-between gap-3 py-1.5 text-sm", strong && "font-semibold")}>
      <span className="text-muted-foreground">{label}</span>
      {status ? (
        <output role="status" aria-label={label} className="tabular-nums">
          {text}
        </output>
      ) : (
        <span className="tabular-nums">{text}</span>
      )}
    </div>
  );
}

function Summary({ snapshot: { totals, payment_methods, cash } }: { snapshot: DaySnapshot }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3 print:grid-cols-3">
      <Card className="gap-2 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base">Penjualan</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <Row label="Penjualan kotor" value={totals.gross} />
          <Row label="Diskon" value={-totals.discount} />
          <Row label="Service" value={totals.service} />
          <Row label="Pajak" value={totals.tax} />
          <Row label="Penjualan bersih" value={totals.net} strong status />
          <Row label="Transaksi" value={`${totals.order_count} order · ${totals.void_count} void`} />
          <Row label="Refund" value={`${formatRupiah(totals.refund_amount)} (${totals.refund_count})`} />
          <Row label="Batal sebelum bayar" value={`${formatRupiah(totals.pre_payment_void_amount)} (${totals.pre_payment_void_count})`} />
          {totals.cash_rounding !== 0 && (
            <Row label="Pembulatan tunai" value={`${totals.cash_rounding > 0 ? "+" : "−"}${formatRupiah(Math.abs(totals.cash_rounding))}`} />
          )}
        </CardContent>
      </Card>
      <Card className="gap-2 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base">Pembayaran</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {payment_methods.length === 0 ? (
            <p className="py-1.5 text-sm text-muted-foreground">Belum ada pembayaran.</p>
          ) : (
            payment_methods.map((m) => <Row key={m.payment_method_id} label={`${methodLabel(m.method_type)} (${m.count})`} value={m.amount - m.refund_amount} />)
          )}
        </CardContent>
      </Card>
      <Card className="gap-2 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base">Kas</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <Row label="Shift" value={`${cash.shift_count} (${cash.open_shift_count} terbuka)`} />
          <Row label="Modal awal" value={cash.opening_cash} />
          <Row label="Kas seharusnya" value={cash.expected_cash} />
          <Row label="Kas terhitung" value={cash.counted_cash} strong />
          <Row label="Selisih kas" value={cash.variance} status />
        </CardContent>
      </Card>
    </div>
  );
}
