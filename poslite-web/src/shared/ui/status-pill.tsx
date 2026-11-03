import type { ReactNode } from "react";

import { cn } from "./utils";

/** Sync, printer and table states in one look (15 · §4): readable in both themes. */
const TONES = {
  ok: "border-success/30 bg-success/10 text-success",
  wait: "border-warning/30 bg-warning/10 text-warning",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
} as const;

export function StatusPill({ tone, children, className }: { tone: keyof typeof TONES; children: ReactNode; className?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
