import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

import { ApiProvider, createApi } from "@/shared/api";

export type Route = (request: { method: string; path: string; body: unknown }) => { status?: number; body: unknown } | undefined;

export const envelope = (data: unknown) => ({ body: { data, message: "OK", meta: {} } });

/** Renders with the real typed client over a fake server: tests exercise the actual API contract. */
export function renderWithApi(ui: ReactElement, route: Route) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchFn = vi.fn<typeof fetch>(async (input) => {
    const request = input as Request;
    const type = request.headers.get("content-type") ?? "";
    // JSON bodies are parsed; anything else (an uploaded file) is recorded as its type and size.
    const body = type.includes("json") ? JSON.parse(await request.text()) : request.body ? { type, size: (await request.arrayBuffer()).byteLength } : undefined;
    const call = { method: request.method, path: new URL(request.url).pathname + new URL(request.url).search, body };
    calls.push(call);
    const reply = route(call) ?? { status: 404, body: { message: "not found", code: "NOT_FOUND" } };
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  });
  const api = createApi({ origin: "http://api.test", getToken: () => "tok", fetch: fetchFn });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api}>{ui}</ApiProvider>
    </QueryClientProvider>,
  );
  return { ...result, calls };
}
