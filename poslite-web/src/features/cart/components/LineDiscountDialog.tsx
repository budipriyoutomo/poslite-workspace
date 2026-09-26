"use client";

import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

import { copy } from "../copy";
import type { LineDiscount } from "../domain/cart";

// Same presets as the order discount; > 20% will need manager approval (06 Order rule 5).
const PERCENTAGES = [5, 10, 15, 20];
const FIXED = [1_000, 2_000, 5_000, 10_000];

export function LineDiscountDialog({ name, onChoose, onClose }: { name: string; onChoose: (discount: LineDiscount) => void; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.lineDiscountTitle(name)}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{copy.lineDiscountHint}</p>
        <div className="grid grid-cols-4 gap-2">
          {PERCENTAGES.map((value) => (
            <Button key={value} variant="outline" onClick={() => onChoose({ type: "percentage", value })}>
              {value}%
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {FIXED.map((value) => (
            <Button key={value} variant="outline" onClick={() => onChoose({ type: "fixed", value })}>
              {formatRupiah(value)}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
