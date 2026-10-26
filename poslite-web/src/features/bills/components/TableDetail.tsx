"use client";

import { Lock, Plus } from "lucide-react";

import type { OpenBillRow } from "@/shared/db";
import { formatRupiah } from "@/shared/money";
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
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/ui/utils";

import { copy } from "../copy";
import type { TableTile } from "../domain/table-status";

interface Props {
  tile: TableTile<OpenBillRow>;
  total: number;
  /** A waiter takes orders but never takes money (ADR-031). */
  canPay?: boolean;
  onOpen: () => void;
  onAddOrder: () => void;
  onPrint: () => void;
  onPay: () => void;
  onMove: () => void;
  onSplit: () => void;
  onCancel: () => void;
  onDismissConflict?: () => void;
}

/** Another device holds the bill right now (ADR-031). */
const holder = (bill: OpenBillRow) => (bill.leaseHolder && bill.leaseHolder.until > new Date().toISOString() ? bill.leaseHolder.deviceName : null);

function Lines({ bill }: { bill: OpenBillRow }) {
  return (
    <ul className="divide-y text-sm">
      {bill.lines.map((l) => {
        const sent = Math.min(l.sentQuantity ?? 0, l.quantity);
        const label = copy.lineLabel(l.quantity, l.name);
        return (
          <li key={l.key} aria-label={label} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {sent > 0 && <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">{sent < l.quantity ? `${copy.inKitchen} ${sent}` : copy.inKitchen}</span>}
            {sent < l.quantity && <span className="rounded-full bg-info/10 px-2 py-0.5 text-xs font-medium text-info">{copy.notSent}</span>}
          </li>
        );
      })}
    </ul>
  );
}

function CancelBill({ bill, onCancel }: { bill: OpenBillRow; onCancel: () => void }) {
  // What the kitchen already had is voided with a manager's PIN (ADR-028); otherwise a plain confirm.
  const hasSent = bill.lines.some((l) => (l.sentQuantity ?? 0) > 0);
  const button = (
    <Button variant="destructive" className="w-full border-destructive/40" onClick={hasSent ? onCancel : undefined}>
      {copy.cancelBill}
    </Button>
  );
  return (
    <div className="space-y-1 border-t border-dashed pt-3">
      {hasSent ? (
        button
      ) : (
        <AlertDialog>
          <AlertDialogTrigger asChild>{button}</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy.cancelTitle(bill.tableLabel)}</AlertDialogTitle>
              <AlertDialogDescription>{copy.cancelHint}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{copy.keep}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onCancel}>
                {copy.confirmCancel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {hasSent && <p className="text-center text-xs text-muted-foreground">{copy.needsManager}</p>}
    </div>
  );
}

/** The chosen table: its order with the kitchen status, the next step first, cancelling apart (15 · UX-04). */
export function TableDetail({ tile, total, canPay = true, onOpen, onAddOrder, onPrint, onPay, onMove, onSplit, onCancel, onDismissConflict }: Props) {
  const { bill } = tile;
  return (
    <section aria-labelledby="table-detail-title" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 id="table-detail-title" className="text-lg font-bold">
        {copy.table(tile.label)}
      </h2>
      {!bill ? (
        <>
          <p className="text-sm text-muted-foreground">{copy.emptyTable}</p>
          <Button className="h-12 w-full" onClick={onOpen}>
            <Plus /> {copy.openBill}
          </Button>
        </>
      ) : (
        <>
          <p className={cn("text-sm", tile.state === "late" && "font-medium text-destructive")}>
            {[...(bill.guestCount ? [copy.guests(bill.guestCount)] : []), copy.minutes(tile.minutes), formatRupiah(total)].join(" · ")}
          </p>
          {holder(bill) && (
            <p className="flex items-center gap-1 text-xs font-medium text-warning">
              <Lock className="size-3" /> {copy.editing(holder(bill)!)}
            </p>
          )}
          {bill.conflict && (
            <div role="alert" className="space-y-1 rounded-md bg-destructive/10 p-2 text-xs">
              <p className="font-semibold">{copy.conflictTitle}</p>
              <p>{copy.conflictHint(bill.conflict.lines.map((l) => `${l.quantity}× ${l.name}`).join(", "))}</p>
              {onDismissConflict && (
                <Button size="sm" variant="ghost" onClick={onDismissConflict}>
                  {copy.dismissConflict}
                </Button>
              )}
            </div>
          )}
          <Lines bill={bill} />
          <Button className="h-12 w-full" onClick={onAddOrder}>
            <Plus /> {copy.addOrder}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={onPrint}>
              {copy.printCheck}
            </Button>
            {canPay && (
              <Button variant="outline" onClick={onPay}>
                {copy.pay}
              </Button>
            )}
            <Button variant="outline" onClick={onMove}>
              {copy.moveTable}
            </Button>
            {canPay && (
              <Button variant="outline" onClick={onSplit}>
                {copy.splitBill}
              </Button>
            )}
          </div>
          <CancelBill bill={bill} onCancel={onCancel} />
        </>
      )}
    </section>
  );
}
