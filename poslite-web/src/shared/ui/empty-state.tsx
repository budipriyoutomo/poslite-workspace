import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./utils";

/** Centered icon, title and optional hint/action for a list or screen with nothing to show. */
export function EmptyState({ icon: Icon, title, hint, className, children }: { icon: LucideIcon; title: string; hint?: string; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground", className)}>
      <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon className="size-7" />
      </span>
      <p className="font-medium text-foreground">{title}</p>
      {hint && <p className="max-w-xs text-sm">{hint}</p>}
      {children}
    </div>
  );
}
