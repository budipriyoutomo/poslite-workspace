"use client";

import { useSession } from "@/features/auth";
import { DEFAULT_DISCOUNT_POLICY } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { DiscountChooser } from "@/shared/ui/discount-chooser";

import { copy } from "../copy";
import type { LineDiscount } from "../domain/cart";

/** Same brand presets as the order discount (06 Order rule 5). */
export function LineDiscountDialog({ name, onChoose, onClose }: { name: string; onChoose: (discount: LineDiscount) => void; onClose: () => void }) {
  const policy = useOutletSetting()?.discountPolicy ?? DEFAULT_DISCOUNT_POLICY;
  const isCashier = useSession((s) => s.user?.role) === "cashier";
  const cashierLimit = isCashier ? { maxPercentage: policy.cashierMaxPercentage, maxAmount: policy.cashierMaxAmount } : undefined;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent mobileSheet className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.lineDiscountTitle(name)}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{copy.lineDiscountHint}</p>
        <DiscountChooser percentages={policy.percentages} amounts={policy.amounts} allowCustom={policy.allowCustom} cashierLimit={cashierLimit} onChoose={onChoose} />
      </DialogContent>
    </Dialog>
  );
}
