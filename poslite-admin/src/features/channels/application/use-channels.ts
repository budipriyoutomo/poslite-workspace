"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type Channel = components["schemas"]["SalesChannelOut"];
export type ChannelIn = components["schemas"]["SalesChannelIn"];

export function useChannels() {
  const api = useApi();
  return useQuery({ queryKey: ["sales-channels"], queryFn: () => unwrap(api.GET("/api/v1/sales-channels")) });
}

function useRefreshing<T>(fn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["sales-channels"] }) });
}

/** Devices get channel changes on their next pull and price with them offline (ADR-029). */
export function useSaveChannel() {
  const api = useApi();
  return useRefreshing(({ id, body }: { id?: string; body: ChannelIn }) =>
    id
      ? unwrap(api.PUT("/api/v1/sales-channels/{channel_id}", { params: { path: { channel_id: id } }, body }))
      : unwrap(api.POST("/api/v1/sales-channels", { body })),
  );
}

export function useSetChannelPrices() {
  const api = useApi();
  return useRefreshing(({ id, prices }: { id: string; prices: { product_id: string; price: number }[] }) =>
    unwrap(api.PUT("/api/v1/sales-channels/{channel_id}/prices", { params: { path: { channel_id: id } }, body: { prices } })),
  );
}

export function useDeleteChannel() {
  const api = useApi();
  return useRefreshing((id: string) => unwrap(api.DELETE("/api/v1/sales-channels/{channel_id}", { params: { path: { channel_id: id } } })));
}
