"use client";

import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { useSessionStore } from "@/features/auth";
import { unwrap, useApi } from "@/shared/api";

/** Outlets of the active brand that the user may see (ADR-022). */
export function useOutlets() {
  const api = useApi();
  const brandId = useSessionStore((s) => s.session?.brandId ?? null);
  return useQuery({
    queryKey: ["outlets", brandId],
    enabled: brandId !== null,
    queryFn: () => unwrap(api.GET("/api/v1/outlets", { params: { query: { brand_id: brandId } } })),
  });
}

/** Every outlet the user may see, across brands (user assignments). */
export function useAllOutlets() {
  const api = useApi();
  return useQuery({ queryKey: ["outlets", "all"], queryFn: () => unwrap(api.GET("/api/v1/outlets")) });
}

/** The outlet the back-office is looking at (prices, devices, reports), remembered per browser. */
export const useOutletChoice = create<{ outletId: string | null; choose: (id: string) => void }>()(
  persist((set) => ({ outletId: null, choose: (outletId) => set({ outletId }) }), {
    name: "poslite-admin-outlet",
    storage: createJSONStorage(() => localStorage),
  }),
);

/** The chosen outlet, falling back to the first one. */
export function useSelectedOutlet() {
  const outlets = useOutlets();
  const outletId = useOutletChoice((s) => s.outletId);
  const list = outlets.data ?? [];
  return list.find((o) => o.id === outletId) ?? list[0] ?? null;
}
