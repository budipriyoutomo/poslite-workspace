import createClient, { type Client } from "openapi-fetch";

import type { paths } from "./schema";

export type Api = Client<paths>;

/** Error envelope of poslite-api (07-api-contract.md): { message, code, errors? }. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function createApi(options: {
  origin: string;
  getToken: () => string | null;
  /** Active brand for brand-level endpoints (ADR-022: X-Brand-Id). */
  getBrandId?: () => string | null;
  fetch?: typeof fetch;
}): Api {
  const client = createClient<paths>({ baseUrl: options.origin, fetch: options.fetch });
  client.use({
    onRequest({ request }) {
      const token = options.getToken();
      if (token) request.headers.set("Authorization", `Bearer ${token}`);
      const brandId = options.getBrandId?.();
      if (brandId) request.headers.set("X-Brand-Id", brandId);
      return request;
    },
  });
  return client;
}

function toApiError(response: Response, error: unknown): ApiError {
  const body = (typeof error === "object" && error !== null ? error : {}) as { code?: unknown; message?: unknown; errors?: unknown };
  const code = typeof body.code === "string" ? body.code : `HTTP_${response.status}`;
  const message = typeof body.message === "string" ? body.message : code;
  const fields = typeof body.errors === "object" && body.errors !== null ? (body.errors as Record<string, string[]>) : {};
  return new ApiError(response.status, code, message, fields);
}

/** Await an openapi-fetch call and return the envelope's `data`, or throw an ApiError. */
type Payload<E> = E extends { data: infer D } ? D : undefined;

export async function unwrap<E extends object>(call: Promise<{ data?: E; error?: unknown; response: Response }>): Promise<Payload<E>> {
  const { data, error, response } = await call;
  if (error !== undefined || !response.ok || data === undefined) throw toApiError(response, error);
  // Endpoints answering { data: null } are typed without `data` by openapi-fetch: they yield undefined.
  return (data as { data?: unknown }).data as Payload<E>;
}

/** Like `unwrap` for list endpoints that page: the rows plus `meta.total` (07-api-contract.md). */
export async function unwrapPage<E extends object>(
  call: Promise<{ data?: E; error?: unknown; response: Response }>,
): Promise<{ rows: Payload<E>; total: number }> {
  const { data, error, response } = await call;
  if (error !== undefined || !response.ok || data === undefined) throw toApiError(response, error);
  const envelope = data as { data?: unknown; meta?: { total?: unknown } };
  const rows = envelope.data as Payload<E>;
  const total = typeof envelope.meta?.total === "number" ? envelope.meta.total : Array.isArray(rows) ? rows.length : 0;
  return { rows, total };
}
