"use client";

import { useSession } from "@/features/auth";
import { useCart } from "@/features/cart";
import { DEFAULT_DISCOUNT_POLICY } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { DiscountChooser } from "@/shared/ui/discount-chooser";

import { copy } from "../copy";

export function DiscountPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const setDiscount = useCart((s) => s.setDiscount);
  // The brand's presets (06 Order rule 5); above its cashier limit, checkout asks for a manager.
  const policy = useOutletSetting()?.discountPolicy ?? DEFAULT_DISCOUNT_POLICY;
  const isCashier = useSession((s) => s.user?.role) === "cashier";
  const cashierLimit = isCashier ? { maxPercentage: policy.cashierMaxPercentage, maxAmount: policy.cashierMaxAmount } : undefined;
  const choose = (discount: { type: "percentage" | "fixed"; value: number }) => {
    setDiscount(discount);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.discountTitle}</DialogTitle>
        </DialogHeader>
        <DiscountChooser percentages={policy.percentages} amounts={policy.amounts} allowCustom={policy.allowCustom} cashierLimit={cashierLimit} onChoose={choose} />
      </DialogContent>
    </Dialog>
  );
}
