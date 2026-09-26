import type { ZodType } from "zod";

export interface ApiConfig {
  baseUrl: string;
  token?: string | null;
  deviceId?: string | null;
  appVersion: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** The server answered with an error envelope ({ message, code }) or a non-JSON 5xx. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string = code,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** 5xx: the whole batch was rolled back server-side, sending it again is safe (idempotent). */
  get isRetryable(): boolean {
    return this.status >= 500 || this.status === 429;
  }
}

/** No response at all (offline, DNS, timeout): always retry later. */
export class NetworkError extends Error {
  readonly isRetryable = true;

  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;

/** fetch wrapper for the POSLite API (07-api-contract.md): token, timeout, envelope, error mapping. */
export async function apiRequest<T>(config: ApiConfig, method: string, path: string, schema: ZodType<T>, body?: unknown): Promise<T> {
  const doFetch = config.fetch ?? fetch;
  const headers: Record<string, string> = { Accept: "application/json", "X-App-Version": config.appVersion };
  if (config.token) headers.Authorization = `Bearer ${config.token}`;
  if (config.deviceId) headers["X-Device-Id"] = config.deviceId;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await doFetch(`${config.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : String(e));
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = (json ?? {}) as { code?: unknown; message?: unknown };
    const code = typeof envelope.code === "string" ? envelope.code : `HTTP_${response.status}`;
    throw new ApiError(response.status, code, typeof envelope.message === "string" ? envelope.message : code);
  }
  const parsed = schema.safeParse((json as { data?: unknown } | null)?.data);
  if (!parsed.success) throw new ApiError(response.status, "INVALID_RESPONSE", parsed.error.message);
  return parsed.data;
}
