"use client";

import { useQuery } from "@tanstack/react-query";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { unwrap, useApi } from "@/shared/api";

export function useOutlets() {
  const api = useApi();
  return useQuery({ queryKey: ["outlets"], queryFn: () => unwrap(api.GET("/api/v1/outlets")) });
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
