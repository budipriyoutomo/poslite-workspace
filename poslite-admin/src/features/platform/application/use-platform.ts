"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, useApi } from "@/shared/api";

import { useOperatorStore } from "./operator-session";

export type Tenant = components["schemas"]["poslite__platform_admin__presentation__router__TenantOut"];
export type TenantStatus = "active" | "suspended";

export function useOperatorLogin() {
  const api = useApi();
  const signIn = useOperatorStore((s) => s.signIn);
  return useMutation({
    mutationFn: (body: { email: string; password: string }) => unwrap(api.POST("/api/v1/platform/auth/login", { body })),
    onSuccess: (r) => signIn({ token: r.token, expiresAt: r.expires_at }),
  });
}

export function useTenants(status: TenantStatus | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: ["platform-tenants", status ?? "all"],
    queryFn: () => unwrap(api.GET("/api/v1/platform/tenants", { params: { query: status ? { status } : {} } })),
  });
}

/** Suspending stops back-office writes; devices keep pushing sales so no data is lost. */
export function useSetTenantStatus() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TenantStatus }) =>
      status === "suspended"
        ? unwrap(api.POST("/api/v1/platform/tenants/{tenant_id}/suspend", { params: { path: { tenant_id: id } } }))
        : unwrap(api.POST("/api/v1/platform/tenants/{tenant_id}/activate", { params: { path: { tenant_id: id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["platform-tenants"] }),
  });
}
