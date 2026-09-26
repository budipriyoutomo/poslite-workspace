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

function server() {
  return renderWithApi(<TenantsScreen />, ({ method, path }) => {
    if (method === "GET" && path === "/api/v1/platform/tenants") return envelope([KOPI, WARUNG]);
    if (method === "GET" && path === "/api/v1/platform/tenants?status=suspended") return envelope([WARUNG]);
    if (method === "POST") return envelope(null);
    return undefined;
  });
}

const row = async (name: string) => within((await screen.findByRole("cell", { name })).closest("tr")!);

describe("TenantsScreen", () => {
  it("lists tenants with status and size", async () => {
    server();
    const kopi = await row("Kopi Senja");
    expect(kopi.getByLabelText("Status")).toHaveTextContent("Aktif");
    expect(kopi.getByText("kopi-senja")).toBeInTheDocument();
    expect((await row("Warung Bu Tini")).getByLabelText("Status")).toHaveTextContent("Ditangguhkan");
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

  it("filters to suspended tenants", async () => {
    server();
    await row("Kopi Senja");
    await userEvent.selectOptions(screen.getByLabelText("Filter status"), "suspended");

    await waitFor(() => expect(screen.queryByRole("cell", { name: "Kopi Senja" })).not.toBeInTheDocument());
    expect(screen.getByRole("cell", { name: "Warung Bu Tini" })).toBeInTheDocument();
  });

  it("shows the subscription and why a tenant is suspended", async () => {
    server();
    const warung = await row("Warung Bu Tini");
    expect(warung.getByLabelText("Langganan")).toHaveTextContent("Menunggak");
    expect(warung.getByText("Ditangguhkan · tagihan")).toBeInTheDocument();
    expect((await row("Kopi Senja")).getByLabelText("Langganan")).toHaveTextContent("Aktif");
  });
});
