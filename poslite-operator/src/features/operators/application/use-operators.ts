"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

export type OperatorInput = components["schemas"]["OperatorIn"];

export const MIN_PASSWORD = 12;

export function useOperators() {
  const api = useApi();
  return useQuery({ queryKey: ["operators"], queryFn: () => unwrap(api.GET("/api/v1/platform/operators")) });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => Promise.all(["operators", "audit"].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

export function useCreateOperator() {
  const api = useApi();
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: OperatorInput) => unwrap(api.POST("/api/v1/platform/operators", { body })), onSuccess: invalidate });
}

/** Disabling signs the operator out everywhere; the API refuses to disable oneself. */
export function useSetOperatorDisabled() {
  const api = useApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, disabled }: { id: string; disabled: boolean }) => {
      const params = { path: { operator_id: id } };
      return disabled
        ? unwrap(api.POST("/api/v1/platform/operators/{operator_id}/disable", { params }))
        : unwrap(api.POST("/api/v1/platform/operators/{operator_id}/enable", { params }));
    },
    onSuccess: invalidate,
  });
}
