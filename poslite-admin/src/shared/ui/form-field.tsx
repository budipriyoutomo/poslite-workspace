import type { ReactNode } from "react";

export function FormField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export const selectClass = "h-9 w-full rounded-md border bg-white px-3 text-sm";
