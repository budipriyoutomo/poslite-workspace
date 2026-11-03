"use client";

import { Armchair } from "lucide-react";
import { useEffect, useState } from "react";

import { useSession } from "@/features/auth";
import { useCart } from "@/features/cart";
import { activeOrderType, orderTypes, useSaleChannel } from "@/features/checkout";
import { newId } from "@/shared/id";
import { Button } from "@/shared/ui/button";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { toast } from "@/shared/ui/toast";

import { releaseBill, renewLease } from "../application/open-bill-sync";
import { sharedBillDeps, useBillStore } from "../application/shared-bills";
import { useDiningTables, useOpenBills } from "../application/use-bills";
import { copy } from "../copy";
import { BillActions } from "./BillActions";
import { GuestCount } from "./GuestCount";
import { ActiveTableBar, KitchenSendBar } from "./PhoneBillBars";
import { TablePicker } from "./TablePicker";
import { useSendBill } from "./use-send-bill";
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
  const sender = useSendBill();
  const actions = useTableActions(undefined);

  return (
    <>
      <BillActions
        newCount={sender.newCount}
        isSaved={sender.saved !== undefined}
        isEmpty={cart.lines.length === 0}
        canPay={user?.role !== "waiter"}
        total={total}
        isBusy={sender.isBusy}
        onSend={() => void sender.send()}
        onCancel={() => sender.saved && void actions.cancel(sender.saved)}
      />
      {sender.dialog}
      {actions.voidDialog}
    </>
  );
}

/** The table's bar above the menu on a phone (15 · UX-09); nothing when the cart is not a table's bill. */
export function PhoneTableBar() {
  const cart = useCart();
  const tables = useDiningTables() ?? [];
  const bills = useOpenBills() ?? [];
  const [isPicking, setIsPicking] = useState(false);
  if (!cart.bill) return null;
  const isSaved = bills.some((b) => b.id === cart.bill?.id);
  return (
    <>
      <ActiveTableBar tableLabel={cart.bill.tableLabel} canChange={!isSaved} onChange={() => setIsPicking(true)} />
      {isPicking && (
        <TablePicker tables={tables} bills={bills.filter((b) => b.id !== cart.bill?.id)} onPick={(t) => cart.bill && (cart.setBill({ ...cart.bill, ...t }), setIsPicking(false))} onClose={() => setIsPicking(false)} />
      )}
    </>
  );
}

/**
 * The phone's bottom bar while a table's bill has new items (15 · UX-09): "Kirim ke dapur" without
 * opening the order. The caller shows it only then; otherwise its usual cart bar.
 */
export function PhoneSendBar({ subtotal, onOpen }: { subtotal: number; onOpen: () => void }) {
  const cart = useCart();
  const sender = useSendBill();
  const itemCount = cart.lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <>
      <KitchenSendBar newCount={sender.newCount} itemCount={itemCount} subtotal={subtotal} isBusy={sender.isBusy} onSend={() => void sender.send()} onOpen={onOpen} />
      {sender.dialog}
    </>
  );
}
