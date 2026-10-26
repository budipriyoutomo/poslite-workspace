"use client";

import { cn } from "./utils";

interface Props<V extends string> {
  label: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
}

/** One choice of a few, the active one plainly marked (15 §4): order type, view mode, table area. */
export function SegmentedControl<V extends string>({ label, options, value, onChange, className }: Props<V>) {
  return (
    <div role="group" aria-label={label} className={cn("flex gap-1 overflow-x-auto rounded-lg bg-muted p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 shrink-0 rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            o.value === value && "bg-background text-foreground shadow-sm",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
