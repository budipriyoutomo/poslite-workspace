"use client";

import { QrCode as QrCodeIcon, X } from "lucide-react";
import { useState } from "react";

import type { PaymentMethodRow } from "@/shared/db";
import { newId } from "@/shared/id";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { MoneyKeypad } from "@/shared/ui/money-keypad";
import { cn } from "@/shared/ui/utils";

import type { QrisClient } from "../application/dynamic-qris";
import { copy } from "../copy";
import { suggestCashAmounts } from "../domain/cash-suggestions";
import { cashRounding, type CashRoundingRule } from "../domain/cash-rounding";
import { NO_ROUNDING, remainingDue, settle } from "../domain/payment";
import { DynamicQrisDialog } from "./DynamicQrisDialog";
import { PaymentMethodPicker } from "./PaymentMethodPicker";

export interface TenderedInput {
  paymentMethodId: string;
  amount: number;
  reference: string | null;
}

interface Props {
  total: number;
  methods: PaymentMethodRow[];
  onConfirm: (payments: TenderedInput[]) => void;
  isBusy?: boolean;
  /** Dynamic QRIS (ADR-019); null/absent when offline or in demo mode → static QRIS only. */
  qris?: QrisClient | null;
  newId?: () => string;
  qrisPollMs?: number;
  /** The sales channel's payment method (ADR-029), e.g. the delivery app; default cash. */
  initialMethodId?: string | null;
  /** The outlet's cash rounding (P1-3); absent = off. */
  rounding?: CashRoundingRule;
}

export function PaymentPanel({ total, methods, onConfirm, isBusy = false, qris = null, newId: makeId = newId, qrisPollMs, initialMethodId = null, rounding: rule = NO_ROUNDING }: Props) {
  const [isShowingQr, setIsShowingQr] = useState(false);
  const [tendered, setTendered] = useState<TenderedInput[]>([]);
  const [method, setMethod] = useState(() => methods.find((m) => m.id === initialMethodId) ?? methods.find((m) => m.type === "cash") ?? methods[0]!);
  const [amount, setAmount] = useState(() => (method.type === "cash" ? 0 : total));
  const [reference, setReference] = useState("");

  const typeOf = (id: string) => methods.find((m) => m.id === id)!.type;
  const toSettle = (list: TenderedInput[]) => list.map((p) => ({ methodType: typeOf(p.paymentMethodId), amount: p.amount }));
  const remaining = remainingDue(total, toSettle(tendered));
  const nonCash = (list: TenderedInput[]) => toSettle(list).reduce((s, p) => s + (p.methodType === "cash" ? 0 : p.amount), 0);
  // Cash is asked for rounded to the outlet's unit (P1-3); the total itself never changes.
  const cashRemaining = Math.max(0, cashRounding(total, nonCash(tendered), rule).cashCharged - (sumOf(tendered) - nonCash(tendered)));
  const current: TenderedInput = { paymentMethodId: method.id, amount, reference: method.requiresReference ? reference.trim() : null };
  const all = amount > 0 || tendered.length === 0 ? [...tendered, current] : tendered;
  const settlement = settle(total, toSettle(all), rule);
  const roundingNow = toSettle(all).some((p) => p.methodType === "cash") ? cashRounding(total, nonCash(all), rule).rounding : 0;
  const hasReference = !method.requiresReference || amount === 0 || reference.trim().length > 0;

  const choose = (m: PaymentMethodRow) => {
    setMethod(m);
    setReference("");
    setAmount(m.type === "cash" ? 0 : remaining);
  };
  const split = () => {
    setTendered([...tendered, current]);
    choose(methods.find((m) => m.type === "cash") ?? method);
    setAmount(0);
  };

  // 15 · UX-03: from a panel 448px wide (@md), the keypad sits beside the methods and quick amounts, so the
  // keypad and "Selesaikan" fit a 1024×640 tablet without scrolling.
  return (
    <div className="@container">
      <div className="space-y-4 [@media(max-height:760px)]:space-y-3 @md:grid @md:grid-cols-2 @md:gap-x-4 @md:space-y-0">
      <div className="space-y-4 [@media(max-height:760px)]:space-y-3">
      <PaymentMethodPicker methods={methods} selectedId={method.id} onChoose={choose} />
      {method.type === "cash" && (
        <div className="grid grid-cols-2 gap-2 @sm:grid-cols-4 @md:grid-cols-2">
          {suggestCashAmounts(cashRemaining).map((a) => (
            <Button key={a} variant="secondary" className="h-11" onClick={() => setAmount(a)}>
              {formatRupiah(a)}
            </Button>
          ))}
        </div>
      )}
      {method.type === "qris" &&
        (qris ? (
          <Button variant="outline" className="h-11 w-full" disabled={remaining <= 0} onClick={() => setIsShowingQr(true)}>
            <QrCodeIcon /> {copy.qrisDynamic}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{copy.qrisOffline}</p>
        ))}
      {isShowingQr && qris && (
        <DynamicQrisDialog
          amount={remaining}
          client={qris}
          newId={makeId}
          pollMs={qrisPollMs}
          onClose={() => setIsShowingQr(false)}
          onPaid={({ reference, amount: paid }) => {
            setTendered([...tendered, { paymentMethodId: method.id, amount: paid, reference }]);
            setAmount(0);
            setIsShowingQr(false);
          }}
        />
      )}
      {method.requiresReference && (
        <div className="space-y-1">
          <Label htmlFor="payment-reference">{copy.reference}</Label>
          <Input id="payment-reference" value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} />
        </div>
      )}
      {tendered.length > 0 && (
        <ul className="space-y-1 text-sm">
          {tendered.map((p, i) => {
            const name = methods.find((m) => m.id === p.paymentMethodId)!.name;
            return (
              <li key={i} className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5">
                <span>{p.reference ? `${name} · ${p.reference}` : name}</span>
                <span className="ml-auto font-medium">{formatRupiah(p.amount)}</span>
                <Button size="icon-xs" variant="ghost" aria-label={copy.removePayment(name)} onClick={() => setTendered(tendered.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      </div>
      <div className="max-@md:mt-4">
        <MoneyKeypad label={`${copy.amount} · ${method.name}`} value={amount} onChange={setAmount} />
      </div>
      </div>
      {/* Change due and the actions stick to the bottom of the screen: both stay in view while keying the amount.
          Wide panels put them in one row, at most 96px tall (UX-03). */}
      <div className="sticky bottom-0 -mx-3 mt-4 grid grid-cols-2 gap-2 rounded-b-xl border-t bg-card/95 px-3 py-3 backdrop-blur sm:-mx-4 sm:px-4 [@media(max-height:760px)]:mt-3 @md:grid-cols-[1fr_auto_auto] @md:items-center">
        <PaymentSummary total={total} rounding={roundingNow} paid={sumOf(all)} />
        <Button variant="outline" className="h-12 @md:px-4" disabled={amount <= 0 || amount >= remaining || !hasReference} onClick={split}>
          {copy.split}
        </Button>
        <Button className="h-12 text-base @md:px-8" disabled={!settlement.ok || !hasReference || isBusy} onClick={() => onConfirm(all)}>
          {copy.confirm}
        </Button>
      </div>
    </div>
  );
}

const sumOf = (list: TenderedInput[]) => list.reduce((s, p) => s + p.amount, 0);

function PaymentSummary({ total, rounding, paid }: { total: number; rounding: number; paid: number }) {
  const diff = paid - (total + rounding);
  return (
    <output role="status" aria-label={copy.paymentSummary} className="col-span-2 @md:col-span-1 flex items-center justify-between gap-3 rounded-lg bg-slate-900 px-3 py-2 text-white dark:ring-1 dark:ring-white/10">
      <span className="text-xs leading-snug text-slate-400">
        <span className="block">
          {copy.total} <span className="font-semibold text-white">{formatRupiah(total)}</span>
        </span>{" "}
        {rounding !== 0 && (
          <>
            <span className="block">
              {copy.rounding} <span className="text-white">{`${rounding > 0 ? "+" : "−"}${formatRupiah(Math.abs(rounding))}`}</span>
            </span>{" "}
          </>
        )}
        <span className="block">
          {copy.paid} <span className="text-white">{formatRupiah(paid)}</span>
        </span>
      </span>{" "}
      <span className={cn("text-right leading-tight", diff >= 0 ? "text-emerald-400" : "text-red-400")}>
        <span className="block text-xs font-medium">{diff >= 0 ? copy.change : copy.missing}</span>{" "}
        <span className="block text-xl font-bold">{formatRupiah(Math.abs(diff))}</span>
      </span>
    </output>
  );
}
