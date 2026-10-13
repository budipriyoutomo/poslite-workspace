import { Store } from "lucide-react";
import type { ReactNode } from "react";

export function AuthCard({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-4">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_10%_-10%,oklch(0.9_0.08_164/0.55),transparent),radial-gradient(40rem_24rem_at_110%_110%,oklch(0.9_0.06_250/0.5),transparent)]" />
      <div className="relative w-full max-w-md space-y-6 rounded-2xl border bg-card/95 p-8 shadow-xl shadow-emerald-950/5 backdrop-blur">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-600/25">
            <Store className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
        {children}
      </div>
    </main>
  );
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
