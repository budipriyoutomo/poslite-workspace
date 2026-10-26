"use client";

import { Armchair } from "lucide-react";
import { useEffect, useState } from "react";

import { useSession } from "@/features/auth";
import { useCart, voidedUnits } from "@/features/cart";
import { activeOrderType, orderTypes, useSaleChannel } from "@/features/checkout";
import { AppError } from "@/shared/errors";
import { newId } from "@/shared/id";
import { Button } from "@/shared/ui/button";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { toast } from "@/shared/ui/toast";

import { type VoidApproval } from "../application/bills";
import { sendBillToKitchen } from "../application/kitchen";
import { releaseBill, renewLease } from "../application/open-bill-sync";
import { kickBillSync, sharedBillDeps, useBillStore } from "../application/shared-bills";
import { useDiningTables, useOpenBills } from "../application/use-bills";
import { copy } from "../copy";
import { BillActions } from "./BillActions";
import { GuestCount } from "./GuestCount";
import { TablePicker } from "./TablePicker";
import { useBillVoid } from "./use-bill-void";
import { useTableActions } from "./use-table-actions";

const RENEW_MS = 30_000; // the server's lease lasts 60 s (ADR-031)
/** Up to this many order types in a row; more go behind "Lainnya" (15 · UX-06). */
const ALL_FIT = 4;

/** Keeps a shared bill's lease while it is in the cart, and frees it when it leaves unchanged. */
function useBillLease(billId: string | null, isShared: boolean) {
  useEffect(() => {
    if (!billId || !isShared) return;
    const renew = () =>
      void sharedBillDeps().then(
        (deps) => renewLease(billId, deps),
        () => undefined,
      );
    const timer = setInterval(renew, RENEW_MS);
    return () => {
      clearInterval(timer);
      void sharedBillDeps().then(
        (deps) => releaseBill(billId, deps),
        () => undefined,
      );
    };
  }, [billId, isShared]);
}

/**
 * The order type, chosen first above the cart (15 · UX-06): Dine In opens the table picker and
 * keeps the cart as a table's bill (ADR-015, ADR-031); the other types are the brand's channels.
 */
export function OrderTypeBar() {
  const user = useSession((s) => s.user);
  const cart = useCart();
  const sale = useSaleChannel();
  const tables = useDiningTables() ?? [];
  const bills = useOpenBills() ?? [];
  const store = useBillStore();
  const [isPicking, setIsPicking] = useState(false);
  useBillLease(cart.bill?.id ?? null, store.isShared);
  const isSaved = bills.some((b) => b.id === cart.bill?.id);
  const types = orderTypes(sale.channels);
  const active = activeOrderType(types, { hasBill: cart.bill !== null, channelId: sale.channel?.id ?? null });

  const moveTo = (channelId: string) => {
    const channel = sale.channels.find((c) => c.id === channelId);
    if (channel && !cart.setChannel(channel.id, sale.priceById(channel))) return toast.error(copy.notSoldOn(channel.name)), false;
    return true;
  };
  const choose = (value: string) => {
    const type = types.find((t) => t.value === value);
    if (!type || value === active) return;
    if (type.isDineIn) return setIsPicking(true);
    if (moveTo(value)) cart.setBill(null);
  };
  const pick = (table: { tableId: string | null; tableLabel: string }) => {
    if (!user) return;
    const dineIn = types.find((t) => t.isDineIn);
    if (dineIn && sale.channels.length > 0 && !moveTo(dineIn.value)) return;
    cart.setBill({ id: newId(), ...table, openedBy: user.id, openedAt: new Date().toISOString() });
    setIsPicking(false);
  };

  return (
    <div className="mb-2 space-y-2">
      {/* A saved bill stays a table's bill: it is cancelled or paid, never turned into a take-away. */}
      <SegmentedControl label={copy.orderType} options={types} value={active} onChange={choose} maxVisible={types.length > ALL_FIT ? 3 : ALL_FIT} disabled={isSaved} />
      {cart.bill && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1 border-warning/40 bg-warning/10 text-warning" disabled={isSaved} onClick={() => setIsPicking(true)}>
            <Armchair className="size-3.5" /> {copy.table(cart.bill.tableLabel)}
          </Button>
          <GuestCount value={cart.bill.guestCount ?? null} onChange={(guestCount) => cart.bill && cart.setBill({ ...cart.bill, guestCount })} />
        </div>
      )}
      {isPicking && (
        <TablePicker tables={tables} bills={bills.filter((b) => b.id !== cart.bill?.id)} onPick={cart.bill ? (t) => cart.bill && (cart.setBill({ ...cart.bill, ...t }), setIsPicking(false)) : pick} onClose={() => setIsPicking(false)} />
      )}
    </div>
  );
}

/** The cart's actions while it is a table's bill (15 · UX-06): send to the kitchen first, pay second. */
export function BillCartActions({ total }: { total: number }) {
  const user = useSession((s) => s.user);
  const cart = useCart();
  const bills = useOpenBills() ?? [];
  const billVoid = useBillVoid();
  const store = useBillStore();
  const actions = useTableActions(undefined);
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

  return (
    <>
      <BillActions
        newCount={newCount}
        isSaved={saved !== undefined}
        isEmpty={cart.lines.length === 0}
        canPay={user?.role !== "waiter"}
        total={total}
        isBusy={isBusy}
        onSend={() => void send()}
        onCancel={() => saved && void actions.cancel(saved)}
      />
      {billVoid.dialog}
      {actions.voidDialog}
    </>
  );
}
