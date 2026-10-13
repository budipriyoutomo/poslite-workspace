"use client";

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

import { copy } from "../copy";

interface Props {
  bills: OpenBillRow[];
  timezone: string;
  onResume: (bill: OpenBillRow) => void;
  onCancel: (id: string) => void;
  onMove: (bill: OpenBillRow) => void;
}

const gross = (bill: OpenBillRow) => bill.lines.reduce((s, l) => s + (l.unitPrice + l.modifiers.reduce((m, x) => m + x.price, 0)) * l.quantity, 0);
const items = (bill: OpenBillRow) => bill.lines.reduce((n, l) => n + l.quantity, 0);

export function OpenBillList({ bills, timezone, onResume, onCancel, onMove }: Props) {
  if (bills.length === 0) return <p className="py-10 text-center text-muted-foreground">{copy.empty}</p>;
  const time = new Intl.DateTimeFormat("id-ID", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {bills.map((b) => (
        <li key={b.id} aria-label={copy.table(b.tableLabel)} className="space-y-2 rounded-xl border bg-white p-4">
          <p className="text-lg font-bold">{copy.table(b.tableLabel)}</p>
          <p className="text-sm">{copy.summary(items(b), formatRupiah(gross(b)))}</p>
          <p className="text-xs text-muted-foreground">{copy.openedAt(time.format(new Date(b.openedAt)).replace(".", ":"))}</p>
          <div className="flex gap-2">
            <Button className="flex-1" aria-label={copy.resume(b.tableLabel)} onClick={() => onResume(b)}>
              Lanjutkan
            </Button>
            <Button variant="outline" aria-label={copy.move(b.tableLabel)} onClick={() => onMove(b)}>
              Pindah
            </Button>
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
          </div>
        </li>
      ))}
    </ul>
  );
}
