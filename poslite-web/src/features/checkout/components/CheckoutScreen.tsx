"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/features/auth";
import { useCart } from "@/features/cart";
import { DEFAULT_DISCOUNT_POLICY, getDb, isManager, type OrderRow, readState } from "@/shared/db";
import { AppError } from "@/shared/errors";
import { useOutletSetting } from "@/shared/hooks";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

import { payBill } from "../application/pay-bill";
import { placeOrder } from "../application/place-order";
import { sendPaidToKitchen } from "../application/send-to-kitchen";
import { useAvailablePromotions, usePricing } from "../application/use-cart-totals";
import { usePaymentMethods } from "../application/use-payment-methods";
import { useSaleChannel } from "../application/use-sale-channel";
import { useQrisClient } from "../application/use-qris-client";
import { copy } from "../copy";
import { manualDiscounts, needsApproval } from "../domain/discount-policy";
import { canSplit, splitLines } from "../domain/split";
import { DiscountApproval } from "./DiscountApproval";
import { PromotionPicker } from "./PromotionPicker";
import { OrderPlacedDialog } from "./OrderPlacedDialog";
import { OrderReview } from "./OrderReview";
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
  const { lines, discount, promotionIds, togglePromotion, bill, clear, loadBill, externalRef, setExternalRef, customerName, setCustomerName } = useCart();
  // The sale channel's rates (ADR-029) in the brand's price mode (ADR-030), as placeOrder snapshots them.
  const { channel, rates } = useSaleChannel();
  const needsRef = channel?.requiresExternalRef === true && externalRef.trim() === "";
  const [take, setTake] = useState<Record<string, number> | null>(null);
  const { paying, remaining } = toPay(lines, take);
  const totals = usePricing(paying, discount, rates, promotionIds);
  const promotions = useAvailablePromotions(paying);
  const [placed, setPlaced] = useState<OrderRow | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [discountApprovedBy, setDiscountApprovedBy] = useState<string | null>(null);
  const policy = outlet?.discountPolicy ?? DEFAULT_DISCOUNT_POLICY;
  const manual = manualDiscounts(totals.lines, discount, totals.orderDiscount);
  const needsManager =
    !!user &&
    needsApproval({ role: isManager(user.role) ? "manager" : "cashier", manualPercentages: manual.percentages, manualAmount: manual.amount, limits: { maxPercentage: policy.cashierMaxPercentage, maxAmount: policy.cashierMaxAmount } });

  // ADR-031: a table-service outlet's payment closes the shared bill on the server.
  const serviceMode = useLiveQuery(() => readState(getDb(), "serviceMode"), []);

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
            promotionIds,
            payments,
            discountApprovedBy,
            shared: serviceMode === "table_service",
          })
        : await placeOrder({ cashier: user, lines, discount, promotionIds, payments, discountApprovedBy, channelId: channel?.id ?? null, externalRef, customerName });
      if (bill && remaining.length > 0) loadBill(bill, remaining, discount, promotionIds);
      else clear();
      setTake(null);
      setDiscountApprovedBy(null);
      setPlaced(order);
      void sendPaidToKitchen({ order, lines: paying, tableLabel: bill?.tableLabel ?? null, cashierName: user.name }).then(
        ({ hasFailed }) => hasFailed && toast.error(copy.kitchenFailed),
      );
    } catch (e) {
      toast.error(e instanceof AppError ? (copy.errors[e.code] ?? e.code) : String(e));
    } finally {
      setIsPlacing(false);
    }
  };

  if (!outlet || !methods) return null;
  return (
    <div className="grid flex-1 content-start gap-3 p-3 sm:gap-4 sm:p-4 lg:grid-cols-[1fr_28rem] lg:content-stretch">
      <section className="rounded-xl border bg-card p-3 sm:p-4">
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
        <OrderReview itemCount={paying.reduce((n, l) => n + l.quantity, 0)} total={totals.total} forceOpen={take !== null}>
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
        </OrderReview>
      </section>
      <section className="self-start rounded-xl border bg-card p-3 pb-0 sm:p-4 sm:pb-0">
        <h2 className="mb-3 text-lg font-semibold">{copy.checkoutTitle}</h2>
        <PromotionPicker available={promotions} chosenIds={promotionIds} onToggle={togglePromotion} />
        {needsManager && <DiscountApproval approvedBy={discountApprovedBy} onApproved={setDiscountApprovedBy} />}
        {!bill && (
          <label className="mb-3 block space-y-1 text-sm font-medium">
            <span>{copy.customerName}</span>
            <Input aria-label={copy.customerName} maxLength={40} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </label>
        )}
        {channel?.requiresExternalRef && (
          <label className="mb-3 block space-y-1 text-sm font-medium">
            <span>{copy.externalRef(channel.name)}</span>
            <Input aria-label={copy.externalRef(channel.name)} maxLength={50} value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
          </label>
        )}
        {paying.length > 0 && (!needsManager || discountApprovedBy) && !needsRef && (
          <PaymentPanel
            key={`${totals.total}-${channel?.id ?? ""}`}
            total={totals.total}
            methods={methods}
            initialMethodId={channel?.defaultPaymentMethodId}
            {...(outlet?.cashRounding && { rounding: outlet.cashRounding })}
            onConfirm={confirm}
            isBusy={isPlacing}
            qris={qris}
          />
        )}
      </section>
      <OrderPlacedDialog order={placed} />
    </div>
  );
}
