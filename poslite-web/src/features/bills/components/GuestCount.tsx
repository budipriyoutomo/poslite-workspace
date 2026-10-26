"use client";

import { Minus, Plus, Users } from "lucide-react";

import { Button } from "@/shared/ui/button";

import { copy } from "../copy";

const MAX_GUESTS = 999; // the API's limit

/** How many guests sit at the table (15 · UX-04): optional, asked when the bill is opened. */
export function GuestCount({ value, onChange }: { value: number | null; onChange: (value: number) => void }) {
  return (
    <div role="group" aria-label={copy.guestsLabel} className="flex items-center rounded-lg border">
      <Button variant="ghost" size="icon-sm" aria-label={copy.fewerGuests} disabled={value === null || value <= 1} onClick={() => onChange((value ?? 1) - 1)}>
        <Minus />
      </Button>
      <span className="flex min-w-16 items-center justify-center gap-1 px-1 text-sm tabular-nums">
        <Users aria-hidden className="size-3.5 text-muted-foreground" />
        {value === null ? copy.noGuests : copy.guests(value)}
      </span>
      <Button variant="ghost" size="icon-sm" aria-label={copy.moreGuests} disabled={value !== null && value >= MAX_GUESTS} onClick={() => onChange((value ?? 0) + 1)}>
        <Plus />
      </Button>
    </div>
  );
}
