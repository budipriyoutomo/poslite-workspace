"use client";

import { CheckCircle2, Plus, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { toast } from "sonner";

import { printReceipt, ReceiptPreview } from "@/features/printing";
import type { OrderRow } from "@/shared/db";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

import { copy } from "../copy";

export function OrderPlacedDialog({ order }: { order: OrderRow | null }) {
  const router = useRouter();
  const newOrderRef = useRef<HTMLButtonElement>(null);
  const print = async () => {
    if (order && !(await printReceipt(order.id))) toast.error(copy.printFailed);
  };

  return (
    <Dialog open={order !== null} onOpenChange={(open) => !open && router.replace("/sell")}>
      <DialogContent
        mobileSheet
        className="max-h-[95dvh] overflow-y-auto sm:max-w-sm"
        // The next customer is waiting: Enter (or one tap) starts a new order.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          newOrderRef.current?.focus();
        }}
      >
        {order && (
          <>
            <DialogHeader className="items-center text-center">
              <span className="flex size-14 animate-in items-center justify-center rounded-full bg-success/15 zoom-in-50 duration-300">
                <CheckCircle2 className="size-8 text-success" />
              </span>
              <DialogTitle className="text-lg">{copy.success}</DialogTitle>
              <DialogDescription>{order.receiptNo}</DialogDescription>
            </DialogHeader>
            <output role="status" aria-label={copy.change} className="block rounded-xl bg-success/10 p-4 text-center">
              <span className="block text-sm font-medium text-success">{copy.change}</span>
              <span className="block text-4xl font-bold text-success">{formatRupiah(order.changeAmount)}</span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {copy.total} {formatRupiah(order.total)} · {copy.paid} {formatRupiah(order.paidAmount)}
              </span>
            </output>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" onClick={print}>
                <Printer /> {copy.print}
              </Button>
              <Button ref={newOrderRef} className="h-12 text-base" onClick={() => router.replace("/sell")}>
                <Plus /> {copy.newOrder}
              </Button>
            </div>
            <ReceiptPreview orderId={order.id} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
