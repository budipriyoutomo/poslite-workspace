import { describe, expect, it, vi } from "vitest";

import { ApiError, createApi, unwrap } from "./client";

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

describe("createApi", () => {
  it("sends the bearer token", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => json({ data: [], message: "OK", meta: {} }));
    const api = createApi({ origin: "http://api.test", getToken: () => "tok", fetch: fetchFn });
    await unwrap(api.GET("/api/v1/outlets"));
    const request = fetchFn.mock.calls[0]![0] as Request;
    expect(request.headers.get("Authorization")).toBe("Bearer tok");
    expect(request.url).toBe("http://api.test/api/v1/outlets");
  });
});
