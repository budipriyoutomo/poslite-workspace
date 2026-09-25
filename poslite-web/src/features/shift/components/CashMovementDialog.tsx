"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/features/auth";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { MoneyKeypad } from "@/shared/ui/money-keypad";

import { recordCashMovement } from "../application/shift";
import { copy } from "../copy";
import { errorMessage } from "./error-message";

export function CashMovementDialog({ type, onClose }: { type: "in" | "out" | null; onClose: () => void }) {
  const user = useSession((s) => s.user);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  const canSave = amount > 0 && reason.trim().length > 0;

  const close = () => {
    setAmount(0);
    setReason("");
    onClose();
  };

  const save = async () => {
    if (!user || !type) return;
    try {
      await recordCashMovement({ type, amount, reason, createdBy: user.id });
      toast.success(copy.movementSaved);
      close();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open={type !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{type && copy.movementTitle(type)}</DialogTitle>
        </DialogHeader>
        <MoneyKeypad label={copy.amount} value={amount} onChange={setAmount} />
        <div className="space-y-2">
          <Label htmlFor="cash-reason">{copy.reason}</Label>
          <Input id="cash-reason" value={reason} placeholder={copy.reasonPlaceholder} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button disabled={!canSave} onClick={save}>
            {copy.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
