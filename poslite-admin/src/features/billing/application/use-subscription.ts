"use client";

import { useQuery } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type Subscription = components["schemas"]["SubscriptionOut"];
export type Invoice = components["schemas"]["InvoiceOut"];

/** Trial, period and invoices (ADR-018); null until the daily billing job first runs. */
export function useSubscription() {
  const api = useApi();
  return useQuery({ queryKey: ["subscription"], queryFn: () => unwrap(api.GET("/api/v1/billing/subscription")) });
}
