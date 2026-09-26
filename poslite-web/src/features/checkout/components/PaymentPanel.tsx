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
import { remainingDue, settle } from "../domain/payment";
import { DynamicQrisDialog } from "./DynamicQrisDialog";

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
}

export function PaymentPanel({ total, methods, onConfirm, isBusy = false, qris = null, newId: makeId = newId, qrisPollMs }: Props) {
  const [isShowingQr, setIsShowingQr] = useState(false);
  const [tendered, setTendered] = useState<TenderedInput[]>([]);
  const [method, setMethod] = useState(() => methods.find((m) => m.type === "cash") ?? methods[0]!);
  const [amount, setAmount] = useState(0);
  const [reference, setReference] = useState("");

  const typeOf = (id: string) => methods.find((m) => m.id === id)!.type;
  const toSettle = (list: TenderedInput[]) => list.map((p) => ({ methodType: typeOf(p.paymentMethodId), amount: p.amount }));
  const remaining = remainingDue(total, toSettle(tendered));
  const current: TenderedInput = { paymentMethodId: method.id, amount, reference: method.requiresReference ? reference.trim() : null };
  const all = amount > 0 || tendered.length === 0 ? [...tendered, current] : tendered;
  const settlement = settle(total, toSettle(all));
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {methods.map((m) => (
          <Button key={m.id} variant="outline" className={cn("h-11", m.id === method.id && "border-emerald-600 bg-emerald-50 font-semibold")} onClick={() => choose(m)}>
            {m.name}
          </Button>
        ))}
      </div>
      {method.type === "cash" && (
        <div className="grid grid-cols-4 gap-2">
          {suggestCashAmounts(remaining).map((a) => (
            <Button key={a} variant="secondary" className="h-11" onClick={() => setAmount(a)}>
              {formatRupiah(a)}
            </Button>
          ))}
        </div>
      )}
      <MoneyKeypad label={`${copy.amount} · ${method.name}`} value={amount} onChange={setAmount} />
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
              <li key={i} className="flex items-center justify-between rounded-md bg-slate-100 px-3 py-1.5">
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
      <PaymentSummary total={total} paid={all.reduce((s, p) => s + p.amount, 0)} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12" disabled={amount <= 0 || amount >= remaining || !hasReference} onClick={split}>
          {copy.split}
        </Button>
        <Button className="h-12 bg-emerald-600 text-base hover:bg-emerald-700" disabled={!settlement.ok || !hasReference || isBusy} onClick={() => onConfirm(all)}>
          {copy.confirm}
        </Button>
      </div>
    </div>
  );
}

function PaymentSummary({ total, paid }: { total: number; paid: number }) {
  const diff = paid - total;
  return (
    <output role="status" aria-label={copy.paymentSummary} className="grid grid-cols-2 gap-1 rounded-lg bg-slate-900 p-3 text-white">
      <span className="text-slate-400">{copy.total}</span>
      <span className="text-right font-semibold tabular-nums">{formatRupiah(total)}</span>
      <span className="text-slate-400">{copy.paid}</span>
      <span className="text-right tabular-nums">{formatRupiah(paid)}</span>
      <span className={cn("col-span-2 flex justify-between text-lg font-bold", diff >= 0 ? "text-emerald-400" : "text-red-400")}>
        <span>{diff >= 0 ? copy.change : copy.missing}</span> <span className="tabular-nums">{formatRupiah(Math.abs(diff))}</span>
      </span>
    </output>
  );
}
