import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ApiError, apiRequest, NetworkError } from "./http-client";

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data, message: "OK", meta: {} }), { status, headers: { "content-type": "application/json" } });
const fail = (status: number, code: string) =>
  new Response(JSON.stringify({ message: "nope", code }), { status, headers: { "content-type": "application/json" } });

const config = (fetchFn: typeof fetch) => ({ baseUrl: "http://api.test/api/v1", token: "tok", deviceId: "DEV1", appVersion: "0.1.0", fetch: fetchFn });

describe("apiRequest", () => {
  it("returns the envelope's data, validated by the schema", async () => {
    const fetchFn = vi.fn(async () => ok({ status: "ok" }));
    await expect(apiRequest(config(fetchFn), "GET", "/health", z.object({ status: z.string() }))).resolves.toEqual({ status: "ok" });
  });

  it("sends the device token, device id and app version", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => ok(null));
    await apiRequest(config(fetchFn), "POST", "/sync/push", z.null(), { events: [] });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe("http://api.test/api/v1/sync/push");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer tok", "X-Device-Id": "DEV1", "X-App-Version": "0.1.0", "Content-Type": "application/json" });
    expect(init?.body).toBe('{"events":[]}');
  });

  it("turns an error response into an ApiError with the server's code", async () => {
    const error = await apiRequest(config(async () => fail(401, "DEVICE_REVOKED")), "GET", "/devices/me", z.unknown()).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "DEVICE_REVOKED", isRetryable: false });
  });

  it("marks server errors as retryable", async () => {
    const error = await apiRequest(config(async () => new Response("boom", { status: 503 })), "GET", "/x", z.unknown()).catch((e) => e);
    expect(error).toMatchObject({ status: 503, code: "HTTP_503", isRetryable: true });
  });

  it("turns a network failure into a NetworkError", async () => {
    const error = await apiRequest(config(async () => Promise.reject(new TypeError("Failed to fetch"))), "GET", "/x", z.unknown()).catch((e) => e);
    expect(error).toBeInstanceOf(NetworkError);
  });

  it("rejects a response that does not match the schema", async () => {
    const error = await apiRequest(config(async () => ok({ status: 1 })), "GET", "/health", z.object({ status: z.string() })).catch((e) => e);
    expect(error).toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
