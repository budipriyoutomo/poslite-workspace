import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { TenantDetailScreen } from "./TenantDetailScreen";

const ID = "01K5ZT00000000000000000001";
const OWNER = "01K5ZU00000000000000000001";
const CASHIER = "01K5ZU00000000000000000002";
const INVOICE = "01K5ZV00000000000000000001";

const detail = (extra: object = {}) => ({
  id: ID,
  slug: "kopi-senja",
  name: "Kopi Senja",
  status: "active",
  created_at: "2026-09-01T03:00:00Z",
  suspended_at: null,
  suspended_reason: null,
  subscription_status: "past_due",
  outlet_count: 1,
  device_count: 1,
  owners: [{ name: "Tini", email: "tini@senja.id" }],
  outlets: [{ id: "O1", code: "BDG01", name: "Dago", brand_name: "Kopi Senja", device_count: 1 }],
  users: [
    { id: OWNER, name: "Tini", email: "tini@senja.id", roles: ["owner"], has_login: true, is_active: true },
    { id: CASHIER, name: "Rina", email: null, roles: ["cashier"], has_login: false, is_active: true },
  ],
  devices: [{ id: "D1", code: "K01", name: "Kasir 1", outlet_name: "Dago", platform: "Android", app_version: "1.4.0", last_seen_at: "2026-10-12T02:00:00Z", revoked_at: null }],
  subscription: { status: "past_due", trial_ends_at: "2026-09-15T03:00:00Z", current_period_end: null },
  invoices: [
    { id: INVOICE, period_start: "2026-09-15", period_end: "2026-10-15", outlet_count: 1, unit_price: 150000, amount: 150000, status: "open", due_at: "2026-09-22T00:00:00Z", paid_at: null },
  ],
  ...extra,
});

function server(tenant = detail(), post: (path: string) => { status?: number; body: unknown } | undefined = () => envelope(null)) {
  return renderWithApi(<TenantDetailScreen tenantId={ID} />, ({ method, path }) => {
    if (method === "GET" && path === `/api/v1/platform/tenants/${ID}`) return envelope(tenant);
    if (method === "GET" && path.startsWith("/api/v1/platform/audit")) return { body: { data: [], message: "OK", meta: { total: 0, limit: 20, offset: 0 } } };
    if (method === "POST") return post(path);
    return undefined;
  });
}

const userRow = async (name: string) => within((await screen.findByRole("table", { name: "Pengguna" })).querySelector(`tr[data-user="${name}"]`) as HTMLElement);

describe("TenantDetailScreen", () => {
  it("shows the owner, outlets, devices, users and billing", async () => {
    server();

    expect(await screen.findByRole("heading", { name: "Kopi Senja" })).toBeInTheDocument();
    expect(screen.getByText("tini@senja.id", { selector: "dd *, dd" })).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Outlet" })).getByText("Dago")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Perangkat" })).getByText("Kasir 1")).toBeInTheDocument();
    expect((await userRow("Rina")).getByText("PIN saja")).toBeInTheDocument();
    expect(screen.getByLabelText("Status langganan")).toHaveTextContent("Menunggak");
    expect(within(screen.getByRole("table", { name: "Tagihan" })).getByText("Rp 150.000")).toBeInTheDocument();
  });

  it("resets a password and shows the temporary one once", async () => {
    const { calls } = server(detail(), (path) => (path.endsWith("/reset-password") ? envelope({ password: "Sementara-12345" }) : undefined));

    await userEvent.click((await userRow("Tini")).getByRole("button", { name: "Reset password Tini" }));
    await userEvent.click(await screen.findByRole("button", { name: "Reset password" }));

    expect(await screen.findByText("Sementara-12345")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.path).toBe(`/api/v1/platform/tenants/${ID}/users/${OWNER}/reset-password`);
  });

  it("offers no password reset to a PIN-only user", async () => {
    server();

    expect((await userRow("Rina")).queryByRole("button", { name: /Reset password/ })).not.toBeInTheDocument();
  });

  it("deactivates a user after confirmation", async () => {
    const { calls } = server();

    await userEvent.click((await userRow("Rina")).getByRole("button", { name: "Nonaktifkan Rina" }));
    await userEvent.click(await screen.findByRole("button", { name: "Nonaktifkan" }));

    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.path).toBe(`/api/v1/platform/tenants/${ID}/users/${CASHIER}/deactivate`));
  });

  it("explains why the last owner stays active", async () => {
    server(detail(), () => ({ status: 409, body: { message: "The company needs another owner first", code: "LAST_OWNER" } }));

    await userEvent.click((await userRow("Tini")).getByRole("button", { name: "Nonaktifkan Tini" }));
    await userEvent.click(await screen.findByRole("button", { name: "Nonaktifkan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Owner aktif terakhir tidak bisa dinonaktifkan");
  });

  it("marks an open invoice paid", async () => {
    const { calls } = server();

    await userEvent.click(await screen.findByRole("button", { name: "Tandai lunas 2026-09-15" }));
    await userEvent.click(await screen.findByRole("button", { name: "Tandai lunas" }));

    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.path).toBe(`/api/v1/platform/invoices/${INVOICE}/mark-paid`));
  });

  it("extends a trial by the chosen number of days", async () => {
    const trial = detail({ subscription_status: "trialing", subscription: { status: "trialing", trial_ends_at: "2026-09-15T03:00:00Z", current_period_end: null }, invoices: [] });
    const { calls } = server(trial, () => envelope({ trial_ends_at: "2026-09-29T03:00:00Z" }));

    await userEvent.click(await screen.findByRole("button", { name: "Perpanjang trial" }));
    const days = screen.getByLabelText("Tambah hari");
    await userEvent.clear(days);
    await userEvent.type(days, "14");
    await userEvent.click(screen.getByRole("button", { name: "Perpanjang" }));

    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: `/api/v1/platform/tenants/${ID}/extend-trial`, body: { days: 14 } }));
  });

  it("offers no trial extension once the tenant pays", async () => {
    server();

    await screen.findByRole("heading", { name: "Kopi Senja" });
    expect(screen.queryByRole("button", { name: "Perpanjang trial" })).not.toBeInTheDocument();
  });

  it("shows when the tenant is unknown", async () => {
    renderWithApi(<TenantDetailScreen tenantId={ID} />, () => ({ status: 404, body: { message: "Tenant not found", code: "TENANT_NOT_FOUND" } }));

    expect(await screen.findByText("Tenant tidak ditemukan.")).toBeInTheDocument();
  });
});
