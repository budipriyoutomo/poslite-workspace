"use client";

import { ChefHat, Save } from "lucide-react";
import Link from "next/link";

import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";

import { copy } from "../copy";

interface Props {
  /** Units not on a kitchen ticket yet. */
  newCount: number;
  isSaved: boolean;
  isEmpty: boolean;
  /** A waiter takes orders but never takes money (ADR-031). */
  canPay: boolean;
  total: number;
  isBusy?: boolean;
  onSend: () => void;
  onCancel: () => void;
}

/** A table's bill in the cart (15 · UX-06): send to the kitchen first, pay second, cancel apart. */
export function BillActions({ newCount, isSaved, isEmpty, canPay, total, isBusy = false, onSend, onCancel }: Props) {
  return (
    <div className="space-y-1">
      {/* One row: the cart's lines keep their room on a 640px-high tablet. */}
      <div className="flex gap-2">
        <Button size="lg" className="h-12 min-w-0 flex-1 text-base" disabled={isEmpty || isBusy} onClick={onSend}>
          {newCount > 0 ? (
            <>
              <ChefHat /> {copy.sendToKitchen(newCount)}
            </>
          ) : (
            <>
              <Save /> {copy.saveBill}
            </>
          )}
        </Button>
        {canPay && (
          // The total is right above; the label stays short beside the main action.
          <Button asChild variant="outline" className="h-12 px-4" disabled={isEmpty}>
            <Link href="/checkout" aria-label={copy.payTotal(formatRupiah(total))} aria-disabled={isEmpty} onClick={(e) => isEmpty && e.preventDefault()}>
              {copy.pay}
            </Link>
          </Button>
        )}
      </div>
      {isSaved && (
        <Button variant="link" size="sm" className="h-auto min-h-0 w-full p-0 text-xs text-destructive pointer-coarse:min-h-8" onClick={onCancel}>
          {copy.cancelBill}
        </Button>
      )}
    </div>
  );
}
