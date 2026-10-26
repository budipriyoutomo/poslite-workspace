import { z } from "zod";

import { type ApiConfig, apiRequest } from "@/shared/api";
import type { LineDiscount, OpenBillLine } from "@/shared/db";

/** A bill as GET/PUT /open-bills return it; lines are this app's own cart lines. */
export interface ServerBill {
  id: string;
  table_id: string | null;
  table_label: string;
  lines: OpenBillLine[];
  discount: LineDiscount | null;
  guest_count: number | null;
  printed_at: string | null;
  opened_by: string;
  opened_at: string;
  version: number;
  lease: {
    device_id: string;
    device_name: string;
    user_id: string;
    until: string;
  } | null;
  updated_at: string;
}

export interface BillBody {
  table_id: string | null;
  table_label: string;
  lines: OpenBillLine[];
  discount: LineDiscount | null;
  guest_count: number | null;
  printed_at: string | null;
  user_id: string;
  release_lease: boolean;
}

/** The open-bill endpoints of the API (07 "Open bills"), injected so tests use an in-memory server. */
export interface OpenBillApi {
  list(): Promise<ServerBill[]>;
  open(input: BillBody & { id: string; opened_by: string; opened_at: string }): Promise<ServerBill>;
  save(id: string, input: BillBody & { version: number }): Promise<ServerBill>;
  lease(id: string, userId: string): Promise<ServerBill>;
  release(id: string): Promise<void>;
  cancel(id: string, version: number): Promise<void>;
}

// 07 "Open bills" (ADR-031). Lines are this app's own cart lines, stored by the server as sent.
const serverBill = z.object({
  id: z.string(),
  table_id: z.string().nullable(),
  table_label: z.string(),
  lines: z.array(z.record(z.string(), z.unknown())).transform((lines) => lines as unknown as OpenBillLine[]),
  discount: z
    .record(z.string(), z.unknown())
    .nullable()
    .transform((d) => d as LineDiscount | null),
  // Absent from an API older than 15 · UX-04.
  guest_count: z.number().int().nullable().default(null),
  printed_at: z.string().nullable().default(null),
  opened_by: z.string(),
  opened_at: z.string(),
  version: z.number().int(),
  lease: z
    .object({
      device_id: z.string(),
      device_name: z.string(),
      user_id: z.string(),
      until: z.string(),
    })
    .nullable(),
  updated_at: z.string(),
}) satisfies z.ZodType<ServerBill, unknown>;

/** The open-bill endpoints for an activated device. */
export function httpOpenBillApi(api: ApiConfig): OpenBillApi {
  return {
    list: () => apiRequest(api, "GET", "/open-bills", z.array(serverBill)),
    open: (input) => apiRequest(api, "POST", "/open-bills", serverBill, input),
    save: (id, input) => apiRequest(api, "PUT", `/open-bills/${id}`, serverBill, input),
    lease: (id, userId) =>
      apiRequest(api, "POST", `/open-bills/${id}/lease`, serverBill, {
        user_id: userId,
      }),
    release: async (id) => void (await apiRequest(api, "DELETE", `/open-bills/${id}/lease`, z.null())),
    cancel: async (id, version) => void (await apiRequest(api, "DELETE", `/open-bills/${id}?version=${version}`, z.null())),
  };
}
