"use client";

import { Armchair, Lock } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import type { OpenBillRow } from "@/shared/db";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";

import { copy } from "../copy";

interface Props {
  bills: OpenBillRow[];
  timezone: string;
  onResume: (bill: OpenBillRow) => void;
  onCancel: (id: string) => void;
  onMove: (bill: OpenBillRow) => void;
  onDismissConflict?: (id: string) => void;
}

const gross = (bill: OpenBillRow) => bill.lines.reduce((s, l) => s + (l.unitPrice + l.modifiers.reduce((m, x) => m + x.price, 0)) * l.quantity, 0);
const items = (bill: OpenBillRow) => bill.lines.reduce((n, l) => n + l.quantity, 0);
/** The kitchen already had something: cancelling it is a void with a manager's PIN (ADR-028). */
const hasSent = (bill: OpenBillRow) => bill.lines.some((l) => (l.sentQuantity ?? 0) > 0);

/** Another device holds the bill right now (ADR-031): read-only here. */
const holder = (bill: OpenBillRow) => (bill.leaseHolder && bill.leaseHolder.until > new Date().toISOString() ? bill.leaseHolder.deviceName : null);

export function OpenBillList({ bills, timezone, onResume, onCancel, onMove, onDismissConflict }: Props) {
  if (bills.length === 0) return <EmptyState icon={Armchair} title={copy.empty} />;
  const time = new Intl.DateTimeFormat("id-ID", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {bills.map((b) => (
        <li key={b.id} aria-label={copy.table(b.tableLabel)} className="space-y-2 rounded-xl border bg-card p-4">
          <p className="text-lg font-bold">{copy.table(b.tableLabel)}</p>
          <p className="text-sm">{copy.summary(items(b), formatRupiah(gross(b)))}</p>
          <p className="text-xs text-muted-foreground">{copy.openedAt(time.format(new Date(b.openedAt)).replace(".", ":"))}</p>
          {holder(b) && (
            <p className="flex items-center gap-1 text-xs font-medium text-warning">
              <Lock className="size-3" /> {copy.editing(holder(b)!)}
            </p>
          )}
          {b.conflict && (
            <div role="alert" className="space-y-1 rounded-md bg-destructive/10 p-2 text-xs">
              <p className="font-semibold">{copy.conflictTitle}</p>
              <p>{copy.conflictHint(b.conflict.lines.map((l) => `${l.quantity}× ${l.name}`).join(", "))}</p>
              {onDismissConflict && (
                <Button size="sm" variant="ghost" onClick={() => onDismissConflict(b.id)}>
                  {copy.dismissConflict}
                </Button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button className="flex-1" aria-label={copy.resume(b.tableLabel)} onClick={() => onResume(b)}>
              Lanjutkan
            </Button>
            <Button variant="outline" aria-label={copy.move(b.tableLabel)} onClick={() => onMove(b)}>
              Pindah
            </Button>
            {hasSent(b) ? (
              <Button variant="outline" aria-label={copy.cancel(b.tableLabel)} onClick={() => onCancel(b.id)}>
                Batalkan
              </Button>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" aria-label={copy.cancel(b.tableLabel)}>
                    Batalkan
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{copy.cancelTitle(b.tableLabel)}</AlertDialogTitle>
                    <AlertDialogDescription>{copy.cancelHint}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{copy.keep}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onCancel(b.id)}>{copy.cancelConfirm}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
