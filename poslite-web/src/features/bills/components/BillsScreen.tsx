"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { useCart } from "@/features/cart";
import type { OpenBillRow } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";

import { AppError } from "@/shared/errors";

import { cancelBill, moveBill } from "../application/bills";
import { useDiningTables, useOpenBills } from "../application/use-bills";
import { copy } from "../copy";
import { OpenBillList } from "./OpenBillList";
import { TablePicker } from "./TablePicker";

export function BillsScreen() {
  const router = useRouter();
  const bills = useOpenBills();
  const outlet = useOutletSetting();
  const cart = useCart();
  const tables = useDiningTables();
  const [moving, setMoving] = useState<OpenBillRow | null>(null);

  const resume = (bill: OpenBillRow) => {
    // The cart holds another sale or bill: never overwrite it silently.
    if (cart.lines.length > 0 && cart.bill?.id !== bill.id) return void toast.error(copy.errors.CART_BUSY);
    const { id, tableId, tableLabel, openedBy, openedAt } = bill;
    cart.loadBill({ id, tableId, tableLabel, openedBy, openedAt }, bill.lines, bill.discount);
    router.push("/sell");
  };
  const cancel = async (id: string) => {
    await cancelBill(id);
    if (cart.bill?.id === id) cart.clear();
  };

  const move = async (bill: OpenBillRow, table: { tableId: string | null; tableLabel: string }) => {
    try {
      await moveBill({ billId: bill.id, table: { id: table.tableId, label: table.tableLabel } });
      // The bill may be open in the cart right now: keep its table in step.
      if (cart.bill?.id === bill.id) cart.loadBill({ ...cart.bill, tableId: table.tableId, tableLabel: table.tableLabel }, cart.lines, cart.discount);
      toast.success(copy.moved(bill.tableLabel, table.tableLabel));
      setMoving(null);
    } catch (e) {
      toast.error(e instanceof AppError ? (copy.errors[e.code] ?? e.code) : String(e));
    }
  };

  if (!bills || !outlet) return null;
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      <div>
        <h1 className="text-xl font-bold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">
          {copy.hint} {copy.localTables}
        </p>
      </div>
      <OpenBillList bills={bills} timezone={outlet.timezone} onResume={resume} onCancel={(id) => void cancel(id)} onMove={setMoving} />
      {moving && (
        <TablePicker
          tables={tables ?? []}
          occupiedTableIds={bills.flatMap((b) => (b.tableId ? [b.tableId] : []))}
          onPick={(table) => void move(moving, table)}
          onClose={() => setMoving(null)}
        />
      )}
    </div>
  );
}
