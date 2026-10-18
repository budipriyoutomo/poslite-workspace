"use client";

import { useQueryClient } from "@tanstack/react-query";

import { selectClass } from "@/shared/ui/form-field";

import { useSessionStore } from "../application/session-store";
import { useAccess, useActiveBrand } from "../application/use-access";

/** The active brand (ADR-022). Brand-level data is cached without the brand in its key, so a
 * switch refetches everything. */
export function BrandSelect() {
  const access = useAccess();
  const active = useActiveBrand();
  const selectBrand = useSessionStore((s) => s.selectBrand);
  const client = useQueryClient();
  const brands = access.data?.brands ?? [];
  if (!active) return null;
  if (brands.length === 1) return <span className="text-sm font-semibold">{active.name}</span>;
  return (
    <select
      aria-label="Brand"
      className={`${selectClass} w-full bg-card sm:w-48`}
      value={active.id}
      onChange={(e) => {
        selectBrand(e.target.value);
        void client.invalidateQueries();
      }}
    >
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
