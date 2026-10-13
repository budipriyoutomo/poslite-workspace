"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { type components, unwrapPage, useApi } from "@/shared/api";

export type AuditEntry = components["schemas"]["AuditEntryOut"];

export const AUDIT_PAGE_SIZE = 20;

export function useAudit({ tenantId, page }: { tenantId?: string; page: number }) {
  const api = useApi();
  return useQuery({
    queryKey: ["audit", tenantId ?? "all", page],
    queryFn: () =>
      unwrapPage(
        api.GET("/api/v1/platform/audit", {
          params: { query: { ...(tenantId && { tenant_id: tenantId }), limit: AUDIT_PAGE_SIZE, offset: page * AUDIT_PAGE_SIZE } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
}
