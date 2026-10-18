"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type DaySnapshot = components["schemas"]["DaySnapshotOut"];
export type DayClosing = components["schemas"]["DayClosingOut"];

/** Live numbers of one outlet's business day, its closing (if any) and late changes (ADR-026). */
export function useDayStatus(outletId: string | undefined, businessDate: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["day-closing", outletId, businessDate],
    enabled: !!outletId,
    placeholderData: keepPreviousData,
    queryFn: () => unwrap(api.GET("/api/v1/day-closings/day", { params: { query: { outlet_id: outletId!, business_date: businessDate } } })),
  });
}

export function useDayClosings(outletId: string | undefined, from: string, to: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["day-closings", outletId, from, to],
    enabled: !!outletId,
    queryFn: () => unwrap(api.GET("/api/v1/day-closings", { params: { query: { outlet_id: outletId!, from, to } } })),
  });
}

export function useCloseDay() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: components["schemas"]["CloseDayIn"]) => unwrap(api.POST("/api/v1/day-closings", { body })),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["day-closing"] }), client.invalidateQueries({ queryKey: ["day-closings"] })]),
  });
}
