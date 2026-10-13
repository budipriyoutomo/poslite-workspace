"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type Brand = components["schemas"]["BrandOut"];
export type BrandIn = components["schemas"]["BrandIn"];

/** Company page (ADR-022): only company-wide users get here. */
export function useBrands() {
  const api = useApi();
  return useQuery({ queryKey: ["brands"], queryFn: () => unwrap(api.GET("/api/v1/brands")) });
}

/** A brand change also changes the access tree (brand names in the header picker). */
function useBrandsMutation<T>(fn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: ["brands"] }), client.invalidateQueries({ queryKey: ["me", "access"] })]),
  });
}

export function useSaveBrand() {
  const api = useApi();
  return useBrandsMutation(({ id, body }: { id?: string; body: BrandIn }) =>
    id ? unwrap(api.PUT("/api/v1/brands/{brand_id}", { params: { path: { brand_id: id } }, body })) : unwrap(api.POST("/api/v1/brands", { body })),
  );
}

export function useDeleteBrand() {
  const api = useApi();
  return useBrandsMutation((id: string) => unwrap(api.DELETE("/api/v1/brands/{brand_id}", { params: { path: { brand_id: id } } })));
}
