import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { TenantsScreen } from "./TenantsScreen";

const tenant = (id: string, name: string, status: string, extra: object = {}) => ({
  id,
  slug: name.toLowerCase().replace(/\s/g, "-"),
  name,
  status,
  created_at: "2026-09-01T03:00:00Z",
  suspended_at: null,
  suspended_reason: null,
  subscription_status: "active",
  outlet_count: 2,
  device_count: 3,
  ...extra,
});
const KOPI = tenant("01K5ZT00000000000000000001", "Kopi Senja", "active");
const WARUNG = tenant("01K5ZT00000000000000000002", "Warung Bu Tini", "suspended", {
  suspended_at: "2026-09-20T03:00:00Z",
  suspended_reason: "billing",
  subscription_status: "past_due",
});

const page = (rows: unknown[], total: number, offset = 0) => ({ body: { data: rows, message: "OK", meta: { total, limit: 20, offset } } });

function server() {
  return renderWithApi(<TenantsScreen />, ({ method, path }) => {
    if (method === "GET" && path === "/api/v1/platform/tenants?limit=20&offset=0") return page([KOPI, WARUNG], 42);
    if (method === "GET" && path === "/api/v1/platform/tenants?limit=20&offset=20") return page([KOPI], 42, 20);
    if (method === "GET" && path === "/api/v1/platform/tenants?status=suspended&limit=20&offset=0") return page([WARUNG], 1);
    if (method === "GET" && path === "/api/v1/platform/tenants?q=senja&limit=20&offset=0") return page([KOPI], 1);
    if (method === "POST") return envelope(null);
    return undefined;
  });
}

const row = async (name: string) => within((await screen.findByRole("link", { name })).closest("tr")!);

describe("TenantsScreen", () => {
  it("lists tenants with status and size, each linking to its detail", async () => {
    server();
    const kopi = await row("Kopi Senja");
    expect(kopi.getByLabelText("Status")).toHaveTextContent("Aktif");
    expect(kopi.getByText("kopi-senja")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kopi Senja" })).toHaveAttribute("href", `/tenants/${KOPI.id}`);
    expect((await row("Warung Bu Tini")).getByLabelText("Status")).toHaveTextContent("Ditangguhkan · tagihan");
  });

  it("searches by name, slug or owner email", async () => {
    const { calls } = server();
    await row("Kopi Senja");
    await userEvent.type(screen.getByRole("searchbox", { name: "Cari tenant" }), "senja{Enter}");

    await waitFor(() => expect(calls.at(-1)?.path).toBe("/api/v1/platform/tenants?q=senja&limit=20&offset=0"));
    expect(await screen.findByText("1–1 dari 1")).toBeInTheDocument();
  });

  it("filters by status", async () => {
    const { calls } = server();
    await row("Kopi Senja");
    await userEvent.selectOptions(screen.getByLabelText("Filter status"), "suspended");

    await waitFor(() => expect(calls.at(-1)?.path).toBe("/api/v1/platform/tenants?status=suspended&limit=20&offset=0"));
  });

  it("pages through the tenants", async () => {
    const { calls } = server();
    expect(await screen.findByText("1–20 dari 42")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sebelumnya" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Berikutnya" }));

    await waitFor(() => expect(calls.at(-1)?.path).toBe("/api/v1/platform/tenants?limit=20&offset=20"));
    expect(await screen.findByText("21–40 dari 42")).toBeInTheDocument();
  });

  it("suspends a tenant after confirmation", async () => {
    const { calls } = server();
    await userEvent.click((await row("Kopi Senja")).getByRole("button", { name: "Tangguhkan Kopi Senja" }));
    await userEvent.click(await screen.findByRole("button", { name: "Tangguhkan" }));

    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.path).toBe(`/api/v1/platform/tenants/${KOPI.id}/suspend`));
  });

  it("reactivates a suspended tenant", async () => {
    const { calls } = server();
    await userEvent.click((await row("Warung Bu Tini")).getByRole("button", { name: "Aktifkan Warung Bu Tini" }));

    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.path).toBe(`/api/v1/platform/tenants/${WARUNG.id}/activate`));
  });
});
