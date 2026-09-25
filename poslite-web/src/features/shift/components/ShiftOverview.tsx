"use client";

import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useState } from "react";

import type { ShiftRow } from "@/shared/db";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

import { useShiftSummary } from "../application/use-shift-summary";
import { copy } from "../copy";
import { CashMovementDialog } from "./CashMovementDialog";
import { CloseShiftDialog } from "./CloseShiftDialog";

export function ShiftOverview({ shift }: { shift: ShiftRow }) {
  const summary = useShiftSummary(shift);
  const [movement, setMovement] = useState<"in" | "out" | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const rows: [string, number][] = summary
    ? [
        [copy.openingCash, summary.openingCash],
        [copy.cashSales, summary.cashSales],
        [copy.cashChange, -summary.cashChange],
        [copy.cashIn, summary.cashIn],
        [copy.cashOut, -summary.cashOut],
      ]
    : [];

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{copy.currentTitle}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {copy.businessDate}: {shift.businessDate} · {copy.openedAt} {new Date(shift.openedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right tabular-nums">{formatRupiah(value)}</dd>
            </div>
          ))}
          <dt className="border-t pt-2 font-semibold">{copy.expectedCash}</dt>
          <dd className="border-t pt-2 text-right text-lg font-bold tabular-nums">{formatRupiah(summary?.expectedCash ?? 0)}</dd>
        </dl>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setMovement("in")}>
            <ArrowDownToLine /> {copy.cashInButton}
          </Button>
          <Button variant="outline" onClick={() => setMovement("out")}>
            <ArrowUpFromLine /> {copy.cashOutButton}
          </Button>
        </div>
        <Button variant="destructive" className="h-11 w-full" onClick={() => setIsClosing(true)}>
          {copy.closeButton}
        </Button>
      </CardContent>
      <CashMovementDialog type={movement} onClose={() => setMovement(null)} />
      <CloseShiftDialog open={isClosing} expectedCash={summary?.expectedCash ?? 0} onClose={() => setIsClosing(false)} />
    </Card>
  );
}
