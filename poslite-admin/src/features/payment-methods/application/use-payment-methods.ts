"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type PaymentMethod = components["schemas"]["PaymentMethodOut"];
export type PaymentMethodIn = components["schemas"]["PaymentMethodIn"];
export type PaymentMethodType = PaymentMethodIn["type"];

export const METHOD_TYPES: { value: PaymentMethodType; label: string }[] = [
  { value: "cash", label: "Tunai" },
  { value: "debit", label: "Debit" },
  { value: "qris", label: "QRIS" },
  { value: "credit_card", label: "Kartu Kredit" },
  { value: "voucher", label: "Voucher" },
  { value: "other", label: "Lainnya" },
];

export const typeLabel = (type: PaymentMethodType) => METHOD_TYPES.find((t) => t.value === type)?.label ?? type;

export function usePaymentMethods() {
  const api = useApi();
  return useQuery({ queryKey: ["payment-methods"], queryFn: () => unwrap(api.GET("/api/v1/payment-methods")) });
}

function useRefreshingMutation<T>(fn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => client.invalidateQueries({ queryKey: ["payment-methods"] }) });
}

export function useSavePaymentMethod() {
  const api = useApi();
  return useRefreshingMutation(({ id, body }: { id?: string; body: PaymentMethodIn }) =>
    id
      ? unwrap(api.PUT("/api/v1/payment-methods/{method_id}", { params: { path: { method_id: id } }, body }))
      : unwrap(api.POST("/api/v1/payment-methods", { body })),
  );
}

export function useDeletePaymentMethod() {
  const api = useApi();
  return useRefreshingMutation((id: string) => unwrap(api.DELETE("/api/v1/payment-methods/{method_id}", { params: { path: { method_id: id } } })));
}
