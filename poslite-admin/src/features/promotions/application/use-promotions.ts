"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type Promotion = components["schemas"]["PromotionOut"];
export type PromotionIn = components["schemas"]["PromotionIn"];

export function usePromotions() {
  const api = useApi();
  return useQuery({ queryKey: ["promotions"], queryFn: () => unwrap(api.GET("/api/v1/promotions")) });
}

function useRefreshing<T>(fn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["promotions"] }) });
}

/** Devices evaluate promotions offline at payment time and get changes on their next pull (ADR-016). */
export function useSavePromotion() {
  const api = useApi();
  return useRefreshing(({ id, body }: { id?: string; body: PromotionIn }) =>
    id
      ? unwrap(api.PUT("/api/v1/promotions/{promotion_id}", { params: { path: { promotion_id: id } }, body }))
      : unwrap(api.POST("/api/v1/promotions", { body })),
  );
}

export function useDeletePromotion() {
  const api = useApi();
  return useRefreshing((id: string) => unwrap(api.DELETE("/api/v1/promotions/{promotion_id}", { params: { path: { promotion_id: id } } })));
}
