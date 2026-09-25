"use client";

import { CheckCircle2, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { printReceipt, ReceiptPreview } from "@/features/printing";
import type { OrderRow } from "@/shared/db";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

import { copy } from "../copy";

export function OrderPlacedDialog({ order }: { order: OrderRow | null }) {
  const router = useRouter();
  const print = async () => {
    if (order && !(await printReceipt(order.id))) toast.error(copy.printFailed);
  };

  return (
    <Dialog open={order !== null} onOpenChange={(open) => !open && router.replace("/sell")}>
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-sm">
        {order && (
          <>
            <DialogHeader className="items-center text-center">
              <CheckCircle2 className="size-12 text-emerald-600" />
              <DialogTitle>{copy.success}</DialogTitle>
              <DialogDescription>{order.receiptNo}</DialogDescription>
            </DialogHeader>
            <div className="rounded-lg bg-emerald-50 p-3 text-center">
              <p className="text-sm text-emerald-800">{copy.change}</p>
              <p className="text-3xl font-bold text-emerald-700 tabular-nums">{formatRupiah(order.changeAmount)}</p>
            </div>
            <ReceiptPreview orderId={order.id} />
            <DialogFooter className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-11" onClick={print}>
                <Printer /> {copy.print}
              </Button>
              <Button className="h-11 bg-emerald-600 hover:bg-emerald-700" onClick={() => router.replace("/sell")}>
                {copy.newOrder}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
