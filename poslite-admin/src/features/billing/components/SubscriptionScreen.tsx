"use client";

import { formatRupiah } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

import { type Invoice, useSubscription } from "../application/use-subscription";

const STATUS: Record<string, string> = { trialing: "Masa coba", active: "Aktif", past_due: "Menunggak" };
const INVOICE: Record<string, string> = { open: "Belum dibayar", paid: "Lunas", void: "Dibatalkan" };
// Periods are calendar dates: format them as UTC so the day never shifts.
const day = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" });
const fmt = (iso: string) => day.format(new Date(iso));

export function SubscriptionScreen() {
  const subscription = useSubscription();
  if (subscription.isPending) return null;
  const sub = subscription.data;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Langganan</h1>
      {!sub ? (
        <p className="text-muted-foreground">Langganan sedang disiapkan — masa coba 14 hari dimulai sejak pendaftaran.</p>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-lg border bg-white p-4">
            <Badge variant={sub.status === "past_due" ? "destructive" : "default"}>{STATUS[sub.status] ?? sub.status}</Badge>
            <span className="text-sm text-muted-foreground">
              {sub.status === "trialing"
                ? `Masa coba berakhir ${fmt(sub.trial_ends_at)}`
                : sub.current_period_end
                  ? `Periode aktif sampai ${fmt(sub.current_period_end)}`
                  : ""}
            </span>
          </div>
          {sub.status === "past_due" && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              Tagihan belum dibayar: perubahan di back-office dikunci sampai lunas. Kasir tetap bisa berjualan.
            </p>
          )}
          <InvoiceTable invoices={sub.invoices} />
        </>
      )}
    </div>
  );
}

function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) return <p className="text-sm text-muted-foreground">Belum ada tagihan.</p>;
  return (
    <table aria-label="Tagihan" className="w-full rounded-lg border bg-white text-sm">
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id} aria-label={`Periode ${fmt(inv.period_start)} - ${fmt(inv.period_end)}`} className="border-b last:border-0">
            <td className="px-3 py-2">
              {fmt(inv.period_start)} – {fmt(inv.period_end)}
            </td>
            <td className="px-3 py-2 text-muted-foreground">{`${inv.outlet_count} outlet × ${formatRupiah(inv.unit_price)}`}</td>
            <td className="px-3 py-2 text-right font-medium tabular-nums">{formatRupiah(inv.amount)}</td>
            <td className="px-3 py-2">
              <Badge variant={inv.status === "paid" ? "secondary" : "outline"}>{INVOICE[inv.status] ?? inv.status}</Badge>
            </td>
            <td className="px-3 py-2 text-right">
              {inv.status === "open" && inv.payment_url && (
                <Button asChild size="sm">
                  <a href={inv.payment_url} target="_blank" rel="noopener noreferrer">
                    Bayar
                  </a>
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
