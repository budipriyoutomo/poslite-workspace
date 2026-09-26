"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type Webhook = components["schemas"]["EndpointOut"];
export type WebhookIn = components["schemas"]["EndpointIn"];
export type Delivery = components["schemas"]["DeliveryOut"];

export const EVENT_TYPES = ["order.placed", "shift.closed"] as const;

export function useWebhooks() {
  const api = useApi();
  return useQuery({ queryKey: ["webhooks"], queryFn: () => unwrap(api.GET("/api/v1/webhooks")) });
}

export function useDeliveries(endpointId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: ["webhook-deliveries", endpointId],
    enabled: endpointId !== null,
    queryFn: () => unwrap(api.GET("/api/v1/webhooks/{endpoint_id}/deliveries", { params: { path: { endpoint_id: endpointId! } } })),
  });
}

/** The response carries the signing secret: the only time it is shown (ADR-020). */
export function useCreateWebhook() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: WebhookIn) => unwrap(api.POST("/api/v1/webhooks", { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/api/v1/webhooks/{endpoint_id}", { params: { path: { endpoint_id: id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

export function useRetryDelivery() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.POST("/api/v1/webhook-deliveries/{delivery_id}/retry", { params: { path: { delivery_id: id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["webhook-deliveries"] }),
  });
}
