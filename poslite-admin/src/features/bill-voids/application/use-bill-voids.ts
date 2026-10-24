"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type BillVoid = components["schemas"]["BillVoidOut"];

/** Items cancelled from open bills after the kitchen had them (ADR-028), for one outlet. */
export function useBillVoids(outletId: string | undefined, from: string, to: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["bill-voids", outletId, from, to],
    enabled: !!outletId,
    placeholderData: keepPreviousData,
    queryFn: () => unwrap(api.GET("/api/v1/reports/bill-voids", { params: { query: { outlet_id: outletId!, from, to } } })),
  });
}
