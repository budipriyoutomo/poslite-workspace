"use client";

import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

import { copy } from "../copy";

interface Props {
  productName: string;
  isAvailable: boolean;
  onChoose: (choice: { isAvailable: boolean; untilEndOfDay: boolean }) => void;
  onClose: () => void;
}

/** Sold out from the POS (P1-2): by default until the business day ends, so tomorrow starts clean. */
export function AvailabilityDialog({ productName, isAvailable, onChoose, onClose }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.availabilityTitle(productName)}</DialogTitle>
          <DialogDescription>{copy.availabilityHint}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {isAvailable ? (
            <>
              <Button onClick={() => onChoose({ isAvailable: false, untilEndOfDay: true })}>{copy.soldOutToday}</Button>
              <Button variant="outline" onClick={() => onChoose({ isAvailable: false, untilEndOfDay: false })}>
                {copy.soldOutUntilOn}
              </Button>
            </>
          ) : (
            <Button onClick={() => onChoose({ isAvailable: true, untilEndOfDay: false })}>{copy.availableAgain}</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
