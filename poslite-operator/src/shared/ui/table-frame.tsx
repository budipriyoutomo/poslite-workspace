import type { ReactNode } from "react";

import { cn } from "./utils";

/** Card around a data table: scrolls sideways on narrow screens instead of widening the page. */
export function TableFrame({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("overflow-x-auto rounded-lg border bg-card [&_th]:whitespace-nowrap", className)}>{children}</div>;
}
