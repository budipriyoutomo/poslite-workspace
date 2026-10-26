"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { getDb } from "@/shared/db";
import { Checkbox } from "@/shared/ui/checkbox";

import { isAutoPrintOn, setAutoPrint } from "../application/auto-print";
import { copy } from "../copy";

/** "Cetak struk otomatis" (15 · UX-03), kept per device: each till has its own printer habits. */
export function AutoPrintToggle() {
  const isOn = useLiveQuery(() => isAutoPrintOn(getDb()), []);
  if (isOn === undefined) return null;
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
      <Checkbox aria-label={copy.autoPrint} checked={isOn} onCheckedChange={(on) => void setAutoPrint(getDb(), on === true)} /> {copy.autoPrint}
    </label>
  );
}
