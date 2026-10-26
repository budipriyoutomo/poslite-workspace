"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useCart, voidedUnits } from "@/features/cart";
import { getDb, type OpenBillRow } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";

import { AppError } from "@/shared/errors";

import { type VoidApproval } from "../application/bills";
import { openForEditing } from "../application/open-bill-sync";
import { sharedBillDeps, useBillStore, useServiceMode } from "../application/shared-bills";
import { useDiningTables, useOpenBills } from "../application/use-bills";
import { copy } from "../copy";
import { OpenBillList } from "./OpenBillList";
import { TablePicker } from "./TablePicker";
import { useBillVoid } from "./use-bill-void";

export function BillsScreen() {
  const router = useRouter();
  const bills = useOpenBills();
  const outlet = useOutletSetting();
  const cart = useCart();
  const tables = useDiningTables();
  const [moving, setMoving] = useState<OpenBillRow | null>(null);
  const billVoid = useBillVoid();
  const store = useBillStore();
  const serviceMode = useServiceMode();
  const fail = (e: unknown) => toast.error(e instanceof AppError ? (copy.errors[e.code] ?? e.code) : String(e));

  const resume = async (bill: OpenBillRow) => {
    // The cart holds another sale or bill: never overwrite it silently.
    if (cart.lines.length > 0 && cart.bill?.id !== bill.id) return void toast.error(copy.errors.CART_BUSY);
    try {
      // A shared bill is edited by one device at a time, from the server's latest copy (ADR-031).
      const latest = store.isShared ? await openForEditing(bill.id, await sharedBillDeps()) : bill;
      const { id, tableId, tableLabel, openedBy, openedAt } = latest;
      cart.loadBill({ id, tableId, tableLabel, openedBy, openedAt }, latest.lines, latest.discount);
      router.push("/sell");
    } catch (e) {
      fail(e);
    }
  };
  const cancel = async (id: string) => {
    const bill = bills?.find((b) => b.id === id);
    if (!bill) return;
    const drop = async (approval?: VoidApproval) => {
      const result = await store.cancel({
        billId: id,
        ...(approval && { void: approval }),
      });
      if (cart.bill?.id === id) cart.clear();
      return result;
    };
    // What the kitchen already had is cancelled only with a manager's approval (ADR-028).
    const voided = voidedUnits(bill.lines, []);
    if (voided.length > 0)
      return billVoid.ask({
        scope: "bill",
        billId: id,
        tableLabel: bill.tableLabel,
        voided,
        run: drop,
      });
    try {
      await drop();
    } catch (e) {
      fail(e);
    }
  };

  const move = async (bill: OpenBillRow, table: { tableId: string | null; tableLabel: string }) => {
    try {
      await store.move({
        billId: bill.id,
        table: { id: table.tableId, label: table.tableLabel },
      });
      // The bill may be open in the cart right now: keep its table in step.
      if (cart.bill?.id === bill.id) cart.loadBill({ ...cart.bill, tableId: table.tableId, tableLabel: table.tableLabel }, cart.lines, cart.discount);
      toast.success(copy.moved(bill.tableLabel, table.tableLabel));
      setMoving(null);
    } catch (e) {
      fail(e);
    }
  };

  if (!bills || !outlet) return null;
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      <div>
        <h1 className="text-xl font-bold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{store.isShared ? copy.sharedHint : `${copy.hint} ${copy.localTables}`}</p>
      </div>
      {serviceMode?.pending && (
        <p role="status" className="rounded-md bg-warning/10 p-3 text-sm text-warning">
          {copy.modePending}
        </p>
      )}
      <OpenBillList
        bills={bills}
        timezone={outlet.timezone}
        onResume={(bill) => void resume(bill)}
        onCancel={(id) => void cancel(id)}
        onMove={setMoving}
        onDismissConflict={(id) => void getDb().openBills.update(id, { conflict: null })}
      />
      {moving && (
        <TablePicker
          tables={tables ?? []}
          occupiedTableIds={bills.flatMap((b) => (b.tableId ? [b.tableId] : []))}
          onPick={(table) => void move(moving, table)}
          onClose={() => setMoving(null)}
        />
      )}
      {billVoid.dialog}
    </div>
  );
}
