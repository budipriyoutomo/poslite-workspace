"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import type { PaymentMethodRow } from "@/shared/db";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { cn } from "@/shared/ui/utils";

import { copy } from "../copy";
import { groupPaymentMethods, type PaymentGroup } from "../domain/payment-groups";

const chosen = "border-primary bg-accent font-semibold text-accent-foreground";

/**
 * Tunai · QRIS · Kartu ▸ · Lainnya ▸ (15 · UX-03): a group with one method chooses it at once; a group
 * with several opens their list. The group of the chosen method says which one it is.
 */
export function PaymentMethodPicker({ methods, selectedId, onChoose }: { methods: PaymentMethodRow[]; selectedId: string; onChoose: (method: PaymentMethodRow) => void }) {
  const [open, setOpen] = useState<PaymentGroup<PaymentMethodRow> | null>(null);
  const groups = groupPaymentMethods(methods);

  const label = (g: PaymentGroup<PaymentMethodRow>) => {
    const [only] = g.methods;
    if (g.methods.length === 1 && only) return only.name;
    const picked = g.methods.find((m) => m.id === selectedId);
    return picked ? copy.chosenInGroup(copy.methodGroups[g.key], picked.name) : copy.methodGroups[g.key];
  };

  return (
    <>
      <div role="group" aria-label={copy.methods} className="grid grid-cols-4 gap-2 @md:grid-cols-2">
        {groups.map((g) => {
          const isChosen = g.methods.some((m) => m.id === selectedId);
          const [only] = g.methods;
          return (
            <Button
              key={g.key}
              variant="outline"
              aria-pressed={isChosen}
              className={cn("h-auto min-h-11 gap-1 px-2 leading-tight whitespace-normal", isChosen && chosen)}
              onClick={() => (g.methods.length === 1 && only ? onChoose(only) : setOpen(g))}
            >
              {label(g)}
              {g.methods.length > 1 && <ChevronRight aria-hidden className="size-4 shrink-0" />}
            </Button>
          );
        })}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent mobileSheet className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{open ? copy.methodGroups[open.key] : ""}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {open?.methods.map((m) => (
              <Button key={m.id} variant="outline" className={cn("h-12 whitespace-normal", m.id === selectedId && chosen)} onClick={() => (onChoose(m), setOpen(null))}>
                {m.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
