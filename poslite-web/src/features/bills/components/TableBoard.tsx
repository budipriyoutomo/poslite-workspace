"use client";

import { ReceiptText } from "lucide-react";
import { useState } from "react";

import type { OpenBillRow } from "@/shared/db";
import { formatRupiah } from "@/shared/money";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { cn } from "@/shared/ui/utils";

import { copy } from "../copy";
import { countByState, type TableState, type TableTile } from "../domain/table-status";

type Tile = TableTile<OpenBillRow>;

interface Props {
  tiles: Tile[];
  areas: string[];
  /** What a bill comes to; absent = not shown. */
  totalOf?: (bill: OpenBillRow) => number;
  selectedKey?: string | null;
  onSelect: (tile: Tile) => void;
  /** Picking a table for a bill: a table that has one cannot be chosen. */
  isPicking?: boolean;
}

// 15 · UX-04 / §4: warning = occupied, info = bill printed, destructive = late.
const TONE: Record<TableState, string> = {
  empty: "border-border bg-card",
  occupied: "border-warning/40 bg-warning/10",
  printed: "border-info/40 bg-info/10",
  late: "border-destructive/50 bg-destructive/10",
};
const DOT: Record<TableState, string> = { empty: "bg-border", occupied: "bg-warning", printed: "bg-info", late: "bg-destructive" };
const STATES: TableState[] = ["empty", "occupied", "printed", "late"];

function describe(t: Tile, total: number | null): string {
  if (!t.bill) return copy.tile([copy.table(t.label), copy.states.empty]);
  return copy.tile([
    copy.table(t.label),
    copy.states[t.state],
    ...(t.state === "late" && t.isPrinted ? [copy.states.printed] : []),
    ...(t.bill.guestCount ? [copy.guests(t.bill.guestCount)] : []),
    copy.minutes(t.minutes),
    ...(total !== null ? [formatRupiah(total)] : []),
  ]);
}

/** The outlet's tables by area, coloured by status, with a legend of how many are in each. */
export function TableBoard({ tiles, areas, totalOf, selectedKey = null, onSelect, isPicking = false }: Props) {
  const [area, setArea] = useState("");
  const counts = countByState(tiles);
  const shown = area ? tiles.filter((t) => t.area === area) : tiles;

  return (
    <div className="space-y-3">
      {areas.length > 0 && (
        <SegmentedControl label={copy.areas} value={area} onChange={setArea} options={[{ value: "", label: copy.allAreas }, ...areas.map((a) => ({ value: a, label: a }))]} />
      )}
      <ul aria-label={copy.legend} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {STATES.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("size-2.5 rounded-full", DOT[s])} />
            <span>{copy.states[s]}</span>
            <span className="font-semibold text-foreground">{counts[s]}</span>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
        {shown.map((t) => {
          const total = t.bill && totalOf ? totalOf(t.bill) : null;
          return (
            <button
              key={t.key}
              type="button"
              data-state={t.state}
              aria-label={describe(t, total)}
              aria-pressed={selectedKey === t.key}
              disabled={isPicking && t.bill !== null}
              onClick={() => onSelect(t)}
              className={cn(
                "relative flex min-h-24 flex-col items-start gap-0.5 rounded-xl border-2 p-3 text-left transition-colors disabled:opacity-50",
                TONE[t.state],
                selectedKey === t.key && "ring-3 ring-ring",
              )}
            >
              <span className="text-lg font-bold leading-none">{t.label}</span>
              {t.bill ? (
                <>
                  <span className={cn("text-xs font-medium", t.state === "late" && "text-destructive")}>
                    {[...(t.bill.guestCount ? [copy.guests(t.bill.guestCount)] : []), copy.minutes(t.minutes)].join(" · ")}
                  </span>
                  <span className="mt-auto text-sm font-semibold tabular-nums">{total !== null && formatRupiah(total)}</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">{t.area || copy.states.empty}</span>
              )}
              {t.isPrinted && <ReceiptText aria-hidden className="absolute top-2 right-2 size-4 text-info" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
