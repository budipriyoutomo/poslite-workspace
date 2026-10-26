import { describe, expect, it, vi } from "vitest";

import { httpOpenBillApi } from "./open-bill-http";

const BILL = {
  id: "B1",
  table_id: null,
  table_label: "A3",
  lines: [
    {
      key: "k1",
      productId: "P1",
      name: "Es Teh",
      categoryName: "Minuman",
      unitPrice: 5000,
      modifiers: [],
      note: "",
      quantity: 1,
    },
  ],
  discount: null,
  opened_by: "U1",
  opened_at: "2026-10-24T05:00:00Z",
  version: 2,
  lease: null,
  updated_at: "2026-10-24T05:00:00Z",
};

const respond = (data: unknown) => vi.fn(async () => new Response(JSON.stringify({ data }), { status: 200 }));

describe("httpOpenBillApi", () => {
  it("saves over a version with the device token", async () => {
    const fetch = respond(BILL);
    const api = httpOpenBillApi({
      baseUrl: "https://api.test/api/v1",
      token: "tok",
      appVersion: "1",
      fetch,
    });

    const saved = await api.save("B1", {
      version: 1,
      table_id: null,
      table_label: "A3",
      lines: [],
      discount: null,
      guest_count: null,
      printed_at: null,
      user_id: "U1",
      release_lease: true,
    });

    expect(saved.version).toBe(2);
    // An API older than 15 · UX-04 sends neither field.
    expect([saved.guest_count, saved.printed_at]).toEqual([null, null]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method, (init.headers as Record<string, string>).Authorization]).toEqual(["https://api.test/api/v1/open-bills/B1", "PUT", "Bearer tok"]);
    expect(JSON.parse(init.body as string)).toMatchObject({
      version: 1,
      release_lease: true,
    });
  });

  it("cancels a bill naming the version it saw", async () => {
    const fetch = respond(null);
    const api = httpOpenBillApi({
      baseUrl: "https://api.test/api/v1",
      appVersion: "1",
      fetch,
    });

    await api.cancel("B1", 4);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method]).toEqual(["https://api.test/api/v1/open-bills/B1?version=4", "DELETE"]);
  });
});
