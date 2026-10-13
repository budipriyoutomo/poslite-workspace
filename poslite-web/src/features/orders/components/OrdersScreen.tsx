"use client";

import { CloudCheck, CloudUpload, Printer } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { printReceipt, ReceiptPreview } from "@/features/printing";
import { formatRupiah } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/utils";

import { useRefundsOf } from "../application/use-corrections";
import { useOrderDetail, useRecentOrders } from "../application/use-orders";
import { copy } from "../copy";
import { refundBadge } from "../domain/refund-badge";
import { OrderCorrections } from "./OrderCorrections";
import { OrderLookup } from "./OrderLookup";

const BADGES = { VOID: copy.badgeVoid, PARTIAL: copy.badgePartial, FULL: copy.badgeFull } as const;

const time = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Order history with reprint; the selected order is a query param (?id=) so the page stays static (ADR-002). */
export function OrdersScreen() {
  const router = useRouter();
  const selectedId = useSearchParams().get("id");
  const orders = useRecentOrders();
  const detail = useOrderDetail(selectedId);
  const refunds = useRefundsOf(orders?.map((o) => o.id) ?? []);

  const reprint = async (orderId: string) => {
    if (!(await printReceipt(orderId))) toast.error("Struk gagal dicetak — coba lagi");
  };

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_24rem]">
      <ul className="divide-y overflow-y-auto bg-white">
        {orders?.length === 0 && <li className="p-6 text-muted-foreground">Belum ada transaksi.</li>}
        {orders?.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => router.replace(`/orders?id=${o.id}`)}
              className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50", o.id === selectedId && "bg-emerald-50")}
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-semibold">{o.receiptNo}</p>
                <p className="text-xs text-muted-foreground">
                  {time(o.createdAt)} · {o.cashierName} · {o.lines.reduce((n, l) => n + l.quantity, 0)} item
                </p>
              </div>
              {(() => {
                const badge = refundBadge(o, refunds.filter((r) => r.orderId === o.id));
                return badge && <Badge variant={badge === "VOID" ? "destructive" : "secondary"}>{BADGES[badge]}</Badge>;
              })()}
              <Badge variant="outline" className="gap-1" title={o.syncStatus === "synced" ? "Tersinkron" : "Menunggu sinkron"}>
                {o.syncStatus === "synced" ? <CloudCheck className="size-3" /> : <CloudUpload className="size-3" />}
                {o.syncStatus === "synced" ? "Sinkron" : "Pending"}
              </Badge>
              <span className="w-28 text-right font-semibold tabular-nums">{formatRupiah(o.total)}</span>
            </button>
          </li>
        ))}
      </ul>
      <aside className="space-y-3 border-l bg-slate-50 p-4">
        <OrderLookup />
        {detail ? (
          <>
            <ReceiptPreview orderId={detail.order.id} />
            <Button className="w-full" variant="outline" onClick={() => reprint(detail.order.id)}>
              <Printer /> Cetak Ulang
            </Button>
            <OrderCorrections order={detail.order} payments={detail.payments} refunds={refunds.filter((r) => r.orderId === detail.order.id)} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Pilih transaksi untuk melihat struk.</p>
        )}
      </aside>
    </div>
  );
}
