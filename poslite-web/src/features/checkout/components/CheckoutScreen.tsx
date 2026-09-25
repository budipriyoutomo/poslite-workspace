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
import { Button } from "@/shared/ui/button";

import { placeOrder } from "../application/place-order";
import { useCartTotals } from "../application/use-cart-totals";
import { usePaymentMethods } from "../application/use-payment-methods";
import { copy } from "../copy";
import { OrderPlacedDialog } from "./OrderPlacedDialog";
import { OrderSummary } from "./OrderSummary";
import { PaymentPanel, type TenderedInput } from "./PaymentPanel";

export function CheckoutScreen() {
  const user = useSession((s) => s.user);
  const outlet = useOutletSetting();
  const methods = usePaymentMethods();
  const { lines, discount, clear } = useCart();
  const rates = { serviceBps: outlet?.serviceBps ?? 0, taxBps: outlet?.taxBps ?? 0 };
  const totals = useCartTotals(rates);
  const [placed, setPlaced] = useState<OrderRow | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);

  const confirm = async (payments: TenderedInput[]) => {
    if (!user) return;
    setIsPlacing(true);
    try {
      const order = await placeOrder({
        cashier: user,
        lines: lines.map((l) => ({ ...l, modifiers: l.modifiers.map(({ optionId, name, price }) => ({ optionId, name, price })) })),
        discount,
        payments,
      });
      clear();
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
        <ul className="divide-y text-sm">
          {lines.map((l) => (
            <li key={l.key} className="py-2">
              <span className="font-medium">{l.quantity}× {l.name}</span>
              {l.modifiers.length > 0 && <span className="text-muted-foreground"> · {l.modifiers.map((m) => m.name).join(", ")}</span>}
            </li>
          ))}
        </ul>
        <OrderSummary rates={rates} />
      </section>
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">{copy.checkoutTitle}</h2>
        {!totals.isEmpty && <PaymentPanel key={totals.total} total={totals.total} methods={methods} onConfirm={confirm} isBusy={isPlacing} />}
      </section>
      <OrderPlacedDialog order={placed} />
    </div>
  );
}
