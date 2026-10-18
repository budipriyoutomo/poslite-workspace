"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/features/auth";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { MoneyKeypad } from "@/shared/ui/money-keypad";

import { closeShift } from "../application/shift";
import { copy } from "../copy";
import { errorMessage } from "./error-message";

export function CloseShiftDialog({ open, expectedCash, onClose }: { open: boolean; expectedCash: number; onClose: () => void }) {
  const user = useSession((s) => s.user);
  const [countedCash, setCountedCash] = useState(0);
  const variance = countedCash - expectedCash;

  const confirm = async () => {
    if (!user) return;
    try {
      const closed = await closeShift({ closedBy: user.id, countedCash });
      toast.success(copy.closed(formatRupiah(closed.variance ?? 0)));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileSheet>
        <DialogHeader>
          <DialogTitle>{copy.closeTitle}</DialogTitle>
        </DialogHeader>
        <MoneyKeypad label={copy.countedCash} value={countedCash} onChange={setCountedCash} />
        <dl className="grid grid-cols-2 gap-1 text-sm">
          <dt className="text-muted-foreground">{copy.expectedCash}</dt>
          <dd className="text-right font-medium">{formatRupiah(expectedCash)}</dd>
          <dt className="text-muted-foreground">{copy.variance}</dt>
          <dd className={`text-right font-bold tabular-nums ${variance < 0 ? "text-destructive" : "text-success"}`}>{formatRupiah(variance)}</dd>
        </dl>
        <DialogFooter>
          <Button variant="destructive" onClick={confirm}>
            {copy.closeConfirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
