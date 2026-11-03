import type { ProductRow } from "@/shared/db";

import type { Tone } from "../domain/menu-tile";

/** The category colour strip on menu tiles and list rows (15 · UX-06). */
export const STRIP: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  lime: "bg-lime-500",
  orange: "bg-orange-500",
  cyan: "bg-cyan-500",
  neutral: "bg-muted-foreground/40",
};

export function tap(p: ProductRow, onSelect: (p: ProductRow) => void) {
  navigator.vibrate?.(10); // a short tick on phones that support it, so a tap feels registered
  onSelect(p);
}
