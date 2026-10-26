"use client";

import { useState } from "react";

import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { MoneyKeypad } from "@/shared/ui/money-keypad";

import type { CloseShiftCount } from "../application/shift";
import { copy } from "../copy";
import { countedTotal } from "../domain/shift-cash";
import { DenominationCounter } from "./DenominationCounter";

function Expected({ expectedCash, countedCash }: { expectedCash: number; countedCash: number }) {
  const variance = countedCash - expectedCash;
  return (
    <dl className="grid grid-cols-2 gap-1 text-sm">
      <dt className="text-muted-foreground">{copy.expectedCash}</dt>
      <dd className="text-right font-medium">{formatRupiah(expectedCash)}</dd>
      <dt className="text-muted-foreground">{copy.variance}</dt>
      <dd className={`text-right font-bold tabular-nums ${variance < 0 ? "text-destructive" : "text-success"}`}>{formatRupiah(variance)}</dd>
    </dl>
  );
}

/**
 * Count the drawer and close the shift. Blind (15 · UX-02): the cashier counts per denomination and
 * never sees the expected cash or the variance, so the count cannot be bent to match; a manager does.
 */
export function CloseShiftDialog({
  open,
  expectedCash,
  isBlind,
  canSeeExpected,
  onConfirm,
  onClose,
}: {
  open: boolean;
  expectedCash: number;
  isBlind: boolean;
  canSeeExpected: boolean;
  onConfirm: (count: CloseShiftCount) => Promise<void>;
  onClose: () => void;
}) {
  const [countedCash, setCountedCash] = useState(0);
  const [denominations, setDenominations] = useState<Record<number, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const counted = isBlind ? countedTotal(denominations) : countedCash;

  const confirm = async () => {
    setIsSaving(true);
    try {
      await onConfirm(isBlind ? { denominations } : { countedCash });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet className="max-h-dvh overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{copy.closeTitle}</DialogTitle>
          {isBlind && <DialogDescription>{copy.blindHint}</DialogDescription>}
        </DialogHeader>
        {isBlind ? (
          <DenominationCounter value={denominations} onChange={setDenominations} />
        ) : (
          <MoneyKeypad label={copy.countedCash} value={countedCash} onChange={setCountedCash} />
        )}
        {canSeeExpected && <Expected expectedCash={expectedCash} countedCash={counted} />}
        <DialogFooter>
          <Button variant="destructive" disabled={isSaving} onClick={confirm}>
            {copy.closeConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
