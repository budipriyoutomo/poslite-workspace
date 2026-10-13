import { describe, expect, it, vi } from "vitest";

import { ApiError, createApi, unwrap, unwrapPage } from "./client";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("unwrap", () => {
  it("returns the envelope's data", async () => {
    const api = createApi({ origin: "http://api.test", getToken: () => null, fetch: async () => json({ data: [{ id: "1", code: "JKT01", name: "Kemang" }], message: "OK", meta: {} }) });
    await expect(unwrap(api.GET("/api/v1/outlets"))).resolves.toEqual([{ id: "1", code: "JKT01", name: "Kemang" }]);
  });

  it("throws an ApiError with the server's code and status", async () => {
    const api = createApi({ origin: "http://api.test", getToken: () => null, fetch: async () => json({ message: "Email or password is wrong", code: "INVALID_CREDENTIALS" }, 401) });
    const error = await unwrap(api.POST("/api/v1/auth/login", { body: { email: "a@b.id", password: "x" } })).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "INVALID_CREDENTIALS", message: "Email or password is wrong" });
  });

  it("maps validation errors to their fields", async () => {
    const api = createApi({
      origin: "http://api.test",
      getToken: () => null,
      fetch: async () => json({ message: "Validation failed", code: "VALIDATION_ERROR", errors: { email: ["bad email"] } }, 422),
    });
    const error = await unwrap(api.POST("/api/v1/auth/login", { body: { email: "x", password: "x" } })).catch((e) => e);
    expect(error.fields).toEqual({ email: ["bad email"] });
  });
});

describe("unwrapPage", () => {
  it("returns the rows with the paging meta", async () => {
    const api = createApi({ origin: "http://api.test", getToken: () => null, fetch: async () => json({ data: [{ id: "T1" }], message: "OK", meta: { total: 41, limit: 20, offset: 40 } }) });
    await expect(unwrapPage(api.GET("/api/v1/platform/tenants"))).resolves.toEqual({ rows: [{ id: "T1" }], total: 41 });
  });

  it("throws an ApiError like unwrap", async () => {
    const api = createApi({ origin: "http://api.test", getToken: () => null, fetch: async () => json({ message: "Invalid or expired operator token", code: "UNAUTHENTICATED" }, 401) });
    await expect(unwrapPage(api.GET("/api/v1/platform/tenants"))).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });
});

describe("createApi", () => {
  it("sends the bearer token", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => json({ data: [], message: "OK", meta: {} }));
    const api = createApi({ origin: "http://api.test", getToken: () => "tok", fetch: fetchFn });
    await unwrap(api.GET("/api/v1/outlets"));
    const request = fetchFn.mock.calls[0]![0] as Request;
    expect(request.headers.get("Authorization")).toBe("Bearer tok");
    expect(request.url).toBe("http://api.test/api/v1/outlets");
  });

  it("sends the active brand when there is one (ADR-022)", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => json({ data: [], message: "OK", meta: {} }));
    const withBrand = createApi({ origin: "http://api.test", getToken: () => "tok", getBrandId: () => "B1", fetch: fetchFn });
    const withoutBrand = createApi({ origin: "http://api.test", getToken: () => "tok", getBrandId: () => null, fetch: fetchFn });
    await unwrap(withBrand.GET("/api/v1/outlets"));
    await unwrap(withoutBrand.GET("/api/v1/outlets"));
    expect((fetchFn.mock.calls[0]![0] as Request).headers.get("X-Brand-Id")).toBe("B1");
    expect((fetchFn.mock.calls[1]![0] as Request).headers.has("X-Brand-Id")).toBe(false);
  });
});
