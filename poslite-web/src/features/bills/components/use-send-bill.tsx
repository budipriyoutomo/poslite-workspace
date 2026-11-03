"use client";

import { useState } from "react";

import { useSession } from "@/features/auth";
import { useCart, voidedUnits } from "@/features/cart";
import { AppError } from "@/shared/errors";
import { toast } from "@/shared/ui/toast";

import { type VoidApproval } from "../application/bills";
import { sendBillToKitchen } from "../application/kitchen";
import { kickBillSync, useBillStore } from "../application/shared-bills";
import { useOpenBills } from "../application/use-bills";
import { copy } from "../copy";
import { useBillVoid } from "./use-bill-void";

/** Saves the cart's table bill and sends its new items to the kitchen (15 · UX-06, UX-09). */
export function useSendBill() {
  const user = useSession((s) => s.user);
  const cart = useCart();
  const bills = useOpenBills() ?? [];
  const billVoid = useBillVoid();
  const store = useBillStore();
  const [isBusy, setIsBusy] = useState(false);
  const saved = bills.find((b) => b.id === cart.bill?.id);
  const newCount = cart.lines.reduce((n, l) => n + Math.max(0, l.quantity - (l.sentQuantity ?? 0)), 0);

  const send = async () => {
    if (!cart.bill || !user) return;
    const { bill, lines, discount } = cart;
    const persist = async (approval?: VoidApproval) => {
      const result = await store.save({ bill, lines, discount, ...(approval && { void: approval }) });
      toast.success(`Bill meja ${bill.tableLabel} disimpan`);
      cart.clear();
      void sendBillToKitchen({ billId: bill.id, cashierName: user.name }).then(({ hasFailed }) => {
        if (hasFailed) toast.error(copy.kitchenFailed);
        if (store.isShared) kickBillSync();
      });
      return result;
    };
    // Sent items taken off need a manager's approval first (ADR-028).
    const voided = saved ? voidedUnits(saved.lines, lines) : [];
    if (voided.length > 0) return billVoid.ask({ scope: "line", billId: bill.id, tableLabel: bill.tableLabel, voided, run: persist });
    setIsBusy(true);
    try {
      await persist();
    } catch (e) {
      toast.error(e instanceof AppError ? (copy.errors[e.code] ?? e.code) : String(e));
    } finally {
      setIsBusy(false);
    }
  };

  return { send, newCount, isBusy, saved, dialog: billVoid.dialog };
}
