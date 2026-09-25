"use client";

import { useCart } from "@/features/cart";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

import { copy } from "../copy";

// Prototype presets; all within a cashier's limit (> 20% will need manager approval — 06 Order rule 5).
const PERCENTAGES = [5, 10, 15, 20];
const FIXED = [5_000, 10_000, 25_000, 50_000];

export function DiscountPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const setDiscount = useCart((s) => s.setDiscount);
  const choose = (discount: { type: "percentage" | "fixed"; value: number }) => {
    setDiscount(discount);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.discountTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm font-medium">{copy.percentage}</p>
        <div className="grid grid-cols-4 gap-2">
          {PERCENTAGES.map((value) => (
            <Button key={value} variant="outline" onClick={() => choose({ type: "percentage", value })}>
              {value}%
            </Button>
          ))}
        </div>
        <p className="text-sm font-medium">{copy.fixed}</p>
        <div className="grid grid-cols-2 gap-2">
          {FIXED.map((value) => (
            <Button key={value} variant="outline" onClick={() => choose({ type: "fixed", value })}>
              {formatRupiah(value)}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
