"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type components, unwrap, unwrapPage, useApi } from "@/shared/api";

export type Tenant = components["schemas"]["TenantListItem"];
export type TenantDetail = components["schemas"]["TenantDetailOut"];
export type TenantUser = components["schemas"]["TenantUserOut"];
export type TenantInvoice = components["schemas"]["TenantInvoiceOut"];
export type TenantStatus = "active" | "suspended";

export const PAGE_SIZE = 20;

export interface TenantQuery {
  status?: TenantStatus;
  q?: string;
  page: number;
}

export function useTenants({ status, q, page }: TenantQuery) {
  const api = useApi();
  return useQuery({
    queryKey: ["tenants", "list", { status, q, page }],
    queryFn: () =>
      unwrapPage(
        api.GET("/api/v1/platform/tenants", {
          params: { query: { ...(status && { status }), ...(q && { q }), limit: PAGE_SIZE, offset: page * PAGE_SIZE } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

export function useTenant(id: string) {
  const api = useApi();
  return useQuery({
    queryKey: ["tenants", "detail", id],
    queryFn: () => unwrap(api.GET("/api/v1/platform/tenants/{tenant_id}", { params: { path: { tenant_id: id } } })),
  });
}

/** Every change refreshes the tenant lists, the tenant, the summary and the audit log. */
function useInvalidate() {
  const client = useQueryClient();
  return () => Promise.all(["tenants", "summary", "audit"].map((key) => client.invalidateQueries({ queryKey: [key] })));
}

/** Suspending stops back-office writes; devices keep pushing sales so no data is lost. */
export function useSetTenantStatus() {
  const api = useApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TenantStatus }) =>
      status === "suspended"
        ? unwrap(api.POST("/api/v1/platform/tenants/{tenant_id}/suspend", { params: { path: { tenant_id: id } } }))
        : unwrap(api.POST("/api/v1/platform/tenants/{tenant_id}/activate", { params: { path: { tenant_id: id } } })),
    onSuccess: invalidate,
  });
}

export function useExtendTrial(tenantId: string) {
  const api = useApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (days: number) =>
      unwrap(api.POST("/api/v1/platform/tenants/{tenant_id}/extend-trial", { params: { path: { tenant_id: tenantId } }, body: { days } })),
    onSuccess: invalidate,
  });
}

/** Payment received outside the gateway (bank transfer); a billing suspension is lifted. */
export function useMarkInvoicePaid() {
  const api = useApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (invoiceId: string) => unwrap(api.POST("/api/v1/platform/invoices/{invoice_id}/mark-paid", { params: { path: { invoice_id: invoiceId } } })),
    onSuccess: invalidate,
  });
}

/** Returns the temporary password; it is shown once and never cached. */
export function useResetPassword(tenantId: string) {
  const api = useApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (userId: string) =>
      unwrap(
        api.POST("/api/v1/platform/tenants/{tenant_id}/users/{user_id}/reset-password", {
          params: { path: { tenant_id: tenantId, user_id: userId } },
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useSetUserActive(tenantId: string) {
  const api = useApi();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) => {
      const params = { path: { tenant_id: tenantId, user_id: userId } };
      return active
        ? unwrap(api.POST("/api/v1/platform/tenants/{tenant_id}/users/{user_id}/activate", { params }))
        : unwrap(api.POST("/api/v1/platform/tenants/{tenant_id}/users/{user_id}/deactivate", { params }));
    },
    onSuccess: invalidate,
  });
}
