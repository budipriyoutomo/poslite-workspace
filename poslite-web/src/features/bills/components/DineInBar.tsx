"use client";

import { Armchair, Save, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/features/auth";
import { useCart } from "@/features/cart";
import { AppError } from "@/shared/errors";
import { newId } from "@/shared/id";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

import { saveBill } from "../application/bills";
import { sendBillToKitchen } from "../application/kitchen";
import { useDiningTables, useOpenBills } from "../application/use-bills";
import { copy } from "../copy";
import { TablePicker } from "./TablePicker";

/** Take-away or dine-in for the cart; a dine-in cart can be kept as an open bill (ADR-015). */
export function DineInBar() {
  const user = useSession((s) => s.user);
  const cart = useCart();
  const tables = useDiningTables() ?? [];
  const bills = useOpenBills() ?? [];
  const [isPicking, setIsPicking] = useState(false);
  const isSaved = bills.some((b) => b.id === cart.bill?.id);
  const occupied = bills.filter((b) => b.id !== cart.bill?.id && b.tableId).map((b) => b.tableId!);

  const pick = (table: { tableId: string | null; tableLabel: string }) => {
    if (!user) return;
    cart.setBill({ id: newId(), ...table, openedBy: user.id, openedAt: new Date().toISOString() });
    setIsPicking(false);
  };
  const save = async () => {
    if (!cart.bill || !user) return;
    const billId = cart.bill.id;
    try {
      await saveBill({ bill: cart.bill, lines: cart.lines, discount: cart.discount });
      toast.success(`Bill meja ${cart.bill.tableLabel} disimpan`);
      cart.clear();
      void sendBillToKitchen({ billId, cashierName: user.name }).then(({ hasFailed }) => hasFailed && toast.error(copy.kitchenFailed));
    } catch (e) {
      toast.error(e instanceof AppError ? (copy.errors[e.code] ?? e.code) : String(e));
    }
  };

  if (!cart.bill) {
    return (
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="secondary" className="gap-1">
          <ShoppingBag className="size-3" /> Bawa pulang
        </Badge>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setIsPicking(true)}>
          <Armchair /> Makan di tempat
        </Button>
        {isPicking && <TablePicker tables={tables} occupiedTableIds={occupied} onPick={pick} onClose={() => setIsPicking(false)} />}
      </div>
    );
  }
  return (
    <div className="mb-2 flex items-center gap-2">
      <Badge className="gap-1 bg-amber-600">
        <Armchair className="size-3" /> {copy.table(cart.bill.tableLabel)}
      </Badge>
      {!isSaved && (
        <Button variant="ghost" size="sm" onClick={() => cart.setBill(null)}>
          <ShoppingBag /> Bawa pulang
        </Button>
      )}
      <Button size="sm" variant="outline" className="ml-auto" disabled={cart.lines.length === 0} onClick={() => void save()}>
        <Save /> Simpan bill
      </Button>
    </div>
  );
}
