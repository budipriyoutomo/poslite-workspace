"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type OutletPrice = components["schemas"]["OutletProductOut"];
export type OutletPriceIn = components["schemas"]["OutletProductIn"];

export function useOutletPrices(outletId: string | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ["outlet-products", outletId],
    enabled: outletId !== undefined,
    queryFn: () => unwrap(api.GET("/api/v1/outlets/{outlet_id}/products", { params: { path: { outlet_id: outletId! } } })),
  });
}

/** Price (null = base price) and availability of one product at one outlet; devices get it on their next pull. */
export function useSetOutletPrice(outletId: string | undefined) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, body }: { productId: string; body: OutletPriceIn }) =>
      unwrap(api.PUT("/api/v1/outlets/{outlet_id}/products/{product_id}", { params: { path: { outlet_id: outletId!, product_id: productId } }, body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["outlet-products", outletId] }),
  });
}
