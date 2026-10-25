"use client";

import { CloudCheck, CloudUpload, History, Printer } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { printReceipt, ReceiptPreview } from "@/features/printing";
import { useMediaQuery } from "@/shared/hooks";
import { formatRupiah } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { cn } from "@/shared/ui/utils";

import { useRefundsOf } from "../application/use-corrections";
import { useOrderDetail, useRecentOrders } from "../application/use-orders";
import { copy } from "../copy";
import { refundBadge } from "../domain/refund-badge";
import { OrderCorrections } from "./OrderCorrections";
import { OrderLookup } from "./OrderLookup";

const BADGES = { VOID: copy.badgeVoid, PARTIAL: copy.badgePartial, FULL: copy.badgeFull } as const;

const time = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Order history with reprint; the selected order is a query param (?id=) so the page stays static (ADR-002).
 * The receipt sits beside the list from tablet width, and opens in a bottom sheet on phones.
 */
export function OrdersScreen() {
  const router = useRouter();
  const selectedId = useSearchParams().get("id");
  const orders = useRecentOrders();
  const detail = useOrderDetail(selectedId);
  const refunds = useRefundsOf(orders?.map((o) => o.id) ?? []);
  const isWide = useMediaQuery("(min-width: 768px)", true);

  const reprint = async (orderId: string) => {
    if (!(await printReceipt(orderId))) toast.error("Struk gagal dicetak — coba lagi");
  };

  const receipt = detail ? (
    <>
      <ReceiptPreview orderId={detail.order.id} />
      <Button className="w-full" variant="outline" onClick={() => reprint(detail.order.id)}>
        <Printer /> {copy.reprint}
      </Button>
      <OrderCorrections order={detail.order} payments={detail.payments} refunds={refunds.filter((r) => r.orderId === detail.order.id)} />
    </>
  ) : (
    <p className="text-sm text-muted-foreground">{copy.pickOrder}</p>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[1fr_20rem] lg:grid-cols-[1fr_24rem]">
      <div className="flex min-h-0 flex-1 flex-col bg-card">
        <div className="border-b p-3">
          <OrderLookup />
        </div>
        <ul className="flex-1 divide-y overflow-y-auto">
          {orders?.length === 0 && (
            <li>
              <EmptyState icon={History} title={copy.empty} hint={copy.emptyHint} />
            </li>
          )}
          {orders?.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => router.replace(`/orders?id=${o.id}`)}
                className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60", o.id === selectedId && "bg-accent")}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold">{o.receiptNo}</p>
                  {o.queueNo && (
                    <p className="text-sm font-semibold">
                      {o.queueNo}
                      {o.customerName && ` · ${o.customerName}`}
                    </p>
                  )}
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
                  <span className="max-sm:sr-only">{o.syncStatus === "synced" ? "Sinkron" : "Pending"}</span>
                </Badge>
                <span className="text-right font-semibold tabular-nums sm:w-28">{formatRupiah(o.total)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {isWide ? (
        <aside className="space-y-3 overflow-y-auto border-l bg-muted/50 p-4">{receipt}</aside>
      ) : (
        <Sheet open={Boolean(detail)} onOpenChange={(open) => !open && router.replace("/orders")}>
          <SheetContent side="bottom" aria-describedby={undefined} className="max-h-[90dvh] gap-3 overflow-y-auto rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <SheetHeader className="p-0">
              <SheetTitle className="font-mono">{detail?.order.receiptNo}</SheetTitle>
            </SheetHeader>
            {receipt}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
