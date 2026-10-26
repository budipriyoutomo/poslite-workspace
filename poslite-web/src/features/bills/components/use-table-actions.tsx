"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useSession } from "@/features/auth";
import { useCart, voidedUnits } from "@/features/cart";
import { printGuestCheck } from "@/features/printing";
import type { OpenBillRow } from "@/shared/db";
import { AppError } from "@/shared/errors";
import { newId } from "@/shared/id";
import { toast } from "@/shared/ui/toast";

import { type VoidApproval } from "../application/bills";
import { openForEditing } from "../application/open-bill-sync";
import { kickBillSync, sharedBillDeps, useBillStore } from "../application/shared-bills";
import type { useTables } from "../application/use-tables";
import { copy } from "../copy";
import { useBillVoid } from "./use-bill-void";

type Pricing = NonNullable<ReturnType<typeof useTables>>["pricing"];

/** What the table screen does with a table (15 · UX-04): open, add to, print, pay, move, split, cancel. */
export function useTableActions(pricing: Pricing) {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const cart = useCart();
  const store = useBillStore();
  const billVoid = useBillVoid();
  const [moving, setMoving] = useState<OpenBillRow | null>(null);
  const fail = (e: unknown) => toast.error(e instanceof AppError ? (copy.errors[e.code] ?? e.code) : String(e));
  // The cart holds another sale or bill: never overwrite it silently.
  const isCartBusy = (billId: string | null) => cart.lines.length > 0 && cart.bill?.id !== billId;

  /** Loads the bill into the cart, from the server's latest copy when shared (ADR-031), then goes to `to`. */
  const resume = async (bill: OpenBillRow, to: string) => {
    if (isCartBusy(bill.id)) return void toast.error(copy.errors.CART_BUSY);
    try {
      const latest = store.isShared ? await openForEditing(bill.id, await sharedBillDeps()) : bill;
      const { id, tableId, tableLabel, openedBy, openedAt, guestCount } = latest;
      cart.loadBill({ id, tableId, tableLabel, openedBy, openedAt, guestCount }, latest.lines, latest.discount);
      router.push(to);
    } catch (e) {
      fail(e);
    }
  };

  const open = (table: { tableId: string | null; label: string }) => {
    if (!user) return;
    if (isCartBusy(null)) return void toast.error(copy.errors.CART_BUSY);
    cart.setBill({ id: newId(), tableId: table.tableId, tableLabel: table.label, openedBy: user.id, openedAt: new Date().toISOString() });
    router.push("/sell");
  };

  const withoutTable = () => {
    if (cart.bill && cart.lines.length > 0) return void toast.error(copy.errors.CART_BUSY);
    if (cart.bill) cart.setBill(null);
    router.push("/sell");
  };

  const print = async (bill: OpenBillRow) => {
    if (!pricing || !user) return;
    const priced = pricing(bill.lines, bill.discount);
    const isPrinted = await printGuestCheck({
      billId: bill.id,
      tableLabel: bill.tableLabel,
      guestCount: bill.guestCount ?? null,
      printedBy: user.name,
      lines: bill.lines.map((l) => ({ productName: l.name, quantity: l.quantity, unitPrice: l.unitPrice, notes: l.note, modifiers: l.modifiers, discount: l.discount ?? null })),
      discount: bill.discount,
      ...priced,
    });
    if (!isPrinted) return void toast.error(copy.checkFailed);
    await store.markPrinted(bill.id);
    if (store.isShared) kickBillSync();
    toast.success(copy.checkPrinted(bill.tableLabel));
  };

  const cancel = async (bill: OpenBillRow) => {
    const drop = async (approval?: VoidApproval) => {
      const result = await store.cancel({ billId: bill.id, ...(approval && { void: approval }) });
      if (cart.bill?.id === bill.id) cart.clear();
      return result;
    };
    // What the kitchen already had is cancelled only with a manager's approval (ADR-028).
    const voided = voidedUnits(bill.lines, []);
    if (voided.length > 0) return billVoid.ask({ scope: "bill", billId: bill.id, tableLabel: bill.tableLabel, voided, run: drop });
    try {
      await drop();
    } catch (e) {
      fail(e);
    }
  };

  const move = async (bill: OpenBillRow, table: { tableId: string | null; tableLabel: string }) => {
    try {
      await store.move({ billId: bill.id, table: { id: table.tableId, label: table.tableLabel } });
      // The bill may be open in the cart right now: keep its table in step.
      if (cart.bill?.id === bill.id) cart.loadBill({ ...cart.bill, tableId: table.tableId, tableLabel: table.tableLabel }, cart.lines, cart.discount);
      toast.success(copy.moved(bill.tableLabel, table.tableLabel));
      setMoving(null);
    } catch (e) {
      fail(e);
    }
  };

  return { resume, open, withoutTable, print, cancel, move, moving, setMoving, isShared: store.isShared, voidDialog: billVoid.dialog };
}
