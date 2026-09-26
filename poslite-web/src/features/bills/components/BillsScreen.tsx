"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useCart } from "@/features/cart";
import type { OpenBillRow } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";

import { cancelBill } from "../application/bills";
import { useOpenBills } from "../application/use-bills";
import { copy } from "../copy";
import { OpenBillList } from "./OpenBillList";

export function BillsScreen() {
  const router = useRouter();
  const bills = useOpenBills();
  const outlet = useOutletSetting();
  const cart = useCart();

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

  if (!bills || !outlet) return null;
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      <div>
        <h1 className="text-xl font-bold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.hint}</p>
      </div>
      <OpenBillList bills={bills} timezone={outlet.timezone} onResume={resume} onCancel={(id) => void cancel(id)} />
    </div>
  );
}
