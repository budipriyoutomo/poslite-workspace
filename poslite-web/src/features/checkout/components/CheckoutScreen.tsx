"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/features/auth";
import { useCart } from "@/features/cart";
import type { OrderRow } from "@/shared/db";
import { AppError } from "@/shared/errors";
import { useOutletSetting } from "@/shared/hooks";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";

import { payBill } from "../application/pay-bill";
import { placeOrder } from "../application/place-order";
import { usePricing } from "../application/use-cart-totals";
import { usePaymentMethods } from "../application/use-payment-methods";
import { useQrisClient } from "../application/use-qris-client";
import { copy } from "../copy";
import { canSplit, splitLines } from "../domain/split";
import { OrderPlacedDialog } from "./OrderPlacedDialog";
import { OrderSummary } from "./OrderSummary";
import { PaymentPanel, type TenderedInput } from "./PaymentPanel";
import { SplitPicker } from "./SplitPicker";

/** What this payment covers: the whole cart, or the units chosen when splitting a bill by item. */
function toPay<L extends { key: string; quantity: number }>(lines: L[], take: Record<string, number> | null) {
  if (!take) return { paying: lines, remaining: [] as L[] };
  try {
    return splitLines(lines, take);
  } catch {
    return { paying: [] as L[], remaining: lines };
  }
}

export function CheckoutScreen() {
  const user = useSession((s) => s.user);
  const outlet = useOutletSetting();
  const methods = usePaymentMethods();
  const qris = useQrisClient();
  const { lines, discount, bill, clear, loadBill } = useCart();
  const rates = {
    serviceBps: outlet?.serviceBps ?? 0,
    taxBps: outlet?.taxBps ?? 0,
  };
  const [take, setTake] = useState<Record<string, number> | null>(null);
  const { paying, remaining } = toPay(lines, take);
  const totals = usePricing(paying, discount, rates);
  const [placed, setPlaced] = useState<OrderRow | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);

  const confirm = async (payments: TenderedInput[]) => {
    if (!user) return;
    setIsPlacing(true);
    try {
      const order = bill
        ? await payBill({
            bill,
            cashier: user,
            paying,
            remaining,
            discount,
            payments,
          })
        : await placeOrder({ cashier: user, lines, discount, payments });
      if (bill && remaining.length > 0) loadBill(bill, remaining, discount);
      else clear();
      setTake(null);
      setPlaced(order);
    } catch (e) {
      toast.error(e instanceof AppError ? (copy.errors[e.code] ?? e.code) : String(e));
    } finally {
      setIsPlacing(false);
    }
  };

  if (!outlet || !methods) return null;
  return (
    <div className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_28rem]">
      <section className="rounded-xl border bg-white p-4">
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/sell">
            <ArrowLeft /> {copy.back}
          </Link>
        </Button>
        {bill && (
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-lg font-semibold">{copy.tableBill(bill.tableLabel)}</h2>
            <Button size="sm" variant="outline" className="ml-auto" disabled={!canSplit(discount)} onClick={() => setTake(take ? null : {})}>
              {take ? copy.payAll : copy.splitByItem}
            </Button>
          </div>
        )}
        {bill && !canSplit(discount) && <p className="mb-2 text-xs text-muted-foreground">{copy.splitNeedsPercent}</p>}
        {take ? (
          <SplitPicker lines={lines} take={take} onChange={setTake} />
        ) : (
          <ul className="divide-y text-sm">
            {lines.map((l) => (
              <li key={l.key} className="py-2">
                <span className="font-medium">
                  {l.quantity}× {l.name}
                </span>
                {l.modifiers.length > 0 && <span className="text-muted-foreground"> · {l.modifiers.map((m) => m.name).join(", ")}</span>}
              </li>
            ))}
          </ul>
        )}
        {take ? (
          <p className="mt-3 flex justify-between border-t pt-3 text-lg font-bold">
            <span>{copy.payingNow}</span>
            <span className="tabular-nums">{formatRupiah(totals.total)}</span>
          </p>
        ) : (
          <OrderSummary rates={rates} />
        )}
      </section>
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">{copy.checkoutTitle}</h2>
        {paying.length > 0 && <PaymentPanel key={totals.total} total={totals.total} methods={methods} onConfirm={confirm} isBusy={isPlacing} qris={qris} />}
      </section>
      <OrderPlacedDialog order={placed} />
    </div>
  );
}
