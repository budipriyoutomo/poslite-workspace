import { UtensilsCrossed } from "lucide-react";

import { cn } from "./utils";

/** The one POSLite mark (15 · UX-11): header, activation, lock screen and the PWA icon. */
export function PosliteLogo({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <span role="img" aria-label="POSLite" className={cn("flex shrink-0 items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-600 text-white", className)}>
      <UtensilsCrossed aria-hidden className={iconClassName} />
    </span>
  );
}
