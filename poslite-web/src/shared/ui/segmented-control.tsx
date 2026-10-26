"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "./utils";

interface Props<V extends string> {
  label: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  /** At most this many in a row; the rest sit behind "Lainnya". The active one always stays in view. */
  maxVisible?: number;
  disabled?: boolean;
  className?: string;
}

const segmentClass = (isActive: boolean) =>
  cn(
    "flex min-h-11 shrink-0 items-center gap-1 rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-60",
    isActive && "bg-background text-foreground shadow-sm",
  );

/** One choice of a few, the active one plainly marked (15 §4): order type, view mode, table area. */
export function SegmentedControl<V extends string>({ label, options, value, onChange, maxVisible = Infinity, disabled = false, className }: Props<V>) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const fits = options.length <= maxVisible;
  let shown = fits ? options : options.slice(0, maxVisible);
  const active = options.find((o) => o.value === value);
  if (!fits && active && !shown.includes(active)) shown = [...shown.slice(0, -1), active];
  const more = options.filter((o) => !shown.includes(o));

  return (
    <div role="group" aria-label={label} className={cn("flex gap-1 overflow-x-auto rounded-lg bg-muted p-1", className)}>
      {shown.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} disabled={disabled} onClick={() => onChange(o.value)} className={segmentClass(o.value === value)}>
          {o.label}
        </button>
      ))}
      {more.length > 0 && (
        <Popover open={isMoreOpen} onOpenChange={setIsMoreOpen}>
          <PopoverTrigger asChild>
            <button type="button" aria-pressed={false} aria-haspopup="menu" disabled={disabled} className={segmentClass(false)}>
              Lainnya
              <ChevronRight aria-hidden className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent role="menu" align="end" className="w-48 p-1">
            {more.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                onClick={() => (onChange(o.value), setIsMoreOpen(false))}
                className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm hover:bg-muted"
              >
                {o.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
