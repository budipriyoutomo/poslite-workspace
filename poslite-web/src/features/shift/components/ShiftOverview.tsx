"use client";

import { ArrowDownToLine, ArrowUpFromLine, Eye } from "lucide-react";
import { useState } from "react";

import { ManagerApproval, useSession } from "@/features/auth";
import { isManager, type ShiftRow } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { toast } from "@/shared/ui/toast";

import { closeShift, type CloseShiftCount } from "../application/shift";
import { useShiftSummary } from "../application/use-shift-summary";
import { copy } from "../copy";
import { CashMovementDialog } from "./CashMovementDialog";
import { CloseShiftDialog } from "./CloseShiftDialog";
import { errorMessage } from "./error-message";

type Summary = NonNullable<ReturnType<typeof useShiftSummary>>;

/** What a blind-counting cashier may see: nothing to work the expected cash out from (15 · UX-02). */
const blindRows = (s: Summary): [string, string][] => [
  [copy.openingCash, formatRupiah(s.openingCash)],
  [copy.transactions, String(s.paidCount)],
  [copy.cashIn, formatRupiah(s.cashIn)],
  [copy.cashOut, formatRupiah(-s.cashOut)],
  [copy.cashRefunds, formatRupiah(-s.cashRefunds)],
];

const fullRows = (s: Summary): [string, string][] => [
  [copy.openingCash, formatRupiah(s.openingCash)],
  [copy.cashSales, formatRupiah(s.cashSales)],
  [copy.cashChange, formatRupiah(-s.cashChange)],
  [copy.cashIn, formatRupiah(s.cashIn)],
  [copy.cashOut, formatRupiah(-s.cashOut)],
  [copy.cashRefunds, formatRupiah(-s.cashRefunds)],
];

function Reveal({ onApproved }: { onApproved: () => void }) {
  const [isAsking, setIsAsking] = useState(false);
  if (!isAsking)
    return (
      <Button variant="ghost" size="sm" className="w-full" onClick={() => setIsAsking(true)}>
        <Eye /> {copy.revealExpected}
      </Button>
    );
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{copy.revealHint}</p>
      <ManagerApproval approvedBy={null} onApproved={onApproved} />
    </div>
  );
}

export function ShiftOverview({ shift }: { shift: ShiftRow }) {
  const summary = useShiftSummary(shift);
  const user = useSession((s) => s.user);
  const isBlind = useOutletSetting()?.blindClose ?? true;
  const [isRevealed, setIsRevealed] = useState(false);
  const [movement, setMovement] = useState<"in" | "out" | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const canSeeExpected = !isBlind || isManager(user?.role ?? "cashier") || isRevealed;
  const rows = summary ? (canSeeExpected ? fullRows(summary) : blindRows(summary)) : [];

  const close = async (count: CloseShiftCount) => {
    if (!user) return;
    try {
      await closeShift({ closedBy: user.id, ...count });
      toast.success(copy.closed);
      setIsClosing(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

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
              <dd className="text-right tabular-nums">{value}</dd>
            </div>
          ))}
          {/* Only once loaded: a placeholder Rp 0 would read as an empty drawer. */}
          {canSeeExpected && summary && (
            <>
              <dt className="border-t pt-2 font-semibold">{copy.expectedCash}</dt>
              <dd className="border-t pt-2 text-right text-lg font-bold tabular-nums">{formatRupiah(summary.expectedCash)}</dd>
            </>
          )}
        </dl>
        {!canSeeExpected && <Reveal onApproved={() => setIsRevealed(true)} />}
        {summary && (summary.voids.count > 0 || summary.refunds.count > 0) && (
          <p role="status" aria-label="Koreksi" className="text-sm text-muted-foreground">
            {copy.corrections(summary.voids.count, formatRupiah(summary.voids.total), summary.refunds.count, formatRupiah(summary.refunds.total))}
          </p>
        )}
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
      {isClosing && (
        <CloseShiftDialog open expectedCash={summary?.expectedCash ?? 0} isBlind={isBlind} canSeeExpected={canSeeExpected} onConfirm={close} onClose={() => setIsClosing(false)} />
      )}
    </Card>
  );
}
