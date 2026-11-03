"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

import { copy } from "../copy";

/** The common printer problems and what to do, in the outlet's words (15 · UX-08). */
export function PrinterGuide({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent mobileSheet aria-describedby={undefined} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.guideTitle}</DialogTitle>
        </DialogHeader>
        <dl className="space-y-3 text-sm">
          {copy.guideItems.map(([problem, fix]) => (
            <div key={problem}>
              <dt className="font-semibold">{problem}</dt>
              <dd className="text-muted-foreground">{fix}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
