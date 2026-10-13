"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { type Api, ApiError, unwrap, useApi } from "@/shared/api";

/** One outlet, every outlet of a brand, or (no ids) every outlet the user may see (ADR-022). */
export interface ReportQuery {
  outletId?: string;
  brandId?: string;
  from: string;
  to: string;
}

const params = (q: ReportQuery) => ({
  ...(q.outletId ? { outlet_id: q.outletId } : {}),
  ...(q.brandId ? { brand_id: q.brandId } : {}),
  from: q.from,
  to: q.to,
});

export function useSalesSummary(query: ReportQuery | null) {
  const api = useApi();
  return useQuery({
    queryKey: ["sales-summary", query],
    enabled: query !== null,
    // Refetch keeps the frame: the previous numbers stay (dimmed) while the new range loads.
    placeholderData: keepPreviousData,
    queryFn: () =>
      unwrap(api.GET("/api/v1/reports/sales-summary", { params: { query: params(query!) } })),
  });
}

/** Downloads the CSV/XLSX export with the session token and saves it under the server's filename. */
export async function downloadReport(api: Api, query: ReportQuery, format: "csv" | "xlsx"): Promise<void> {
  const { data, response } = await api.GET("/api/v1/reports/sales-summary/export", {
    params: { query: { ...params(query), format } },
    parseAs: "blob",
  });
  if (!response.ok || !(data instanceof Blob)) throw new ApiError(response.status, `HTTP_${response.status}`, "Export gagal");
  const filename = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? `penjualan.${format}`;
  const url = URL.createObjectURL(data);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}
