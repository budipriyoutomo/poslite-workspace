import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { IntegrationsScreen } from "./IntegrationsScreen";

const HOOK = { id: "01K5ZW00000000000000000001", url: "https://erp.example.id/poslite", event_types: ["order.placed"], brand_ids: [], is_active: true };
const DEAD = {
  id: "01K5ZV00000000000000000001",
  event_type: "order.placed",
  status: "dead",
  attempts: 8,
  last_status_code: 500,
  last_error: null,
  created_at: "2026-09-27T03:00:00Z",
  next_attempt_at: "2026-09-27T03:00:00Z",
  delivered_at: null,
};

const ACCESS = {
  tenant: { id: "T", name: "Warung", status: "active" },
  company_scope: true,
  brands: [
    { id: "01K5ZB00000000000000000001", code: "MAHARASA", name: "Maharasa", role: "owner", outlets: [] },
    { id: "01K5ZB00000000000000000002", code: "SUSHI", name: "Sushi", role: "owner", outlets: [] },
  ],
};

function server() {
  return renderWithApi(<IntegrationsScreen />, ({ method, path, body }) => {
    if (path === "/api/v1/me/access") return envelope(ACCESS);
    if (method === "GET" && path === "/api/v1/webhooks") return envelope([HOOK]);
    if (method === "GET" && path === `/api/v1/webhooks/${HOOK.id}/deliveries`) return envelope([DEAD]);
    if (method === "POST" && path === "/api/v1/webhooks") return { status: 201, ...envelope({ id: "01K5ZW00000000000000000002", ...(body as object), is_active: true, secret: "whsec_rahasia" }) };
    if (method === "POST") return envelope(null);
    if (method === "DELETE") return envelope(null);
    return undefined;
  });
}

describe("IntegrationsScreen", () => {
  it("adds an endpoint and shows its secret once", async () => {
    const { calls } = server();
    await userEvent.type(screen.getByLabelText("URL webhook"), "https://inventory.example.id/in");
    await userEvent.click(screen.getByRole("checkbox", { name: "shift.closed" }));
    await userEvent.click(screen.getByRole("button", { name: "Tambah webhook" }));

    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ url: "https://inventory.example.id/in", event_types: ["order.placed", "shift.closed"], brand_ids: [] }));
    expect(await screen.findByText("whsec_rahasia")).toBeInTheDocument();
  });

  it("limits an endpoint to chosen brands (ADR-022)", async () => {
    const { calls } = server();
    await userEvent.type(screen.getByLabelText("URL webhook"), "https://sushi.example.id/in");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Brand Sushi" }));
    await userEvent.click(screen.getByRole("button", { name: "Tambah webhook" }));

    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ brand_ids: ["01K5ZB00000000000000000002"] }));
    expect(await screen.findByText("Semua brand")).toBeInTheDocument(); // the existing endpoint
  });

  it("lists deliveries and resends a dead one", async () => {
    const { calls } = server();
    await userEvent.click(await screen.findByRole("button", { name: `Riwayat ${HOOK.url}` }));
    const row = within(await screen.findByRole("row", { name: /Gagal/ }));
    expect(row.getByText("8×")).toBeInTheDocument();
    expect(row.getByText("HTTP 500")).toBeInTheDocument();

    await userEvent.click(row.getByRole("button", { name: "Kirim ulang" }));

    await waitFor(() => expect(calls.some((c) => c.path === `/api/v1/webhook-deliveries/${DEAD.id}/retry`)).toBe(true));
  });

  it("removes an endpoint after confirmation", async () => {
    const { calls } = server();
    await userEvent.click(await screen.findByRole("button", { name: `Hapus ${HOOK.url}` }));
    await userEvent.click(await screen.findByRole("button", { name: "Hapus" }));

    await waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe(`/api/v1/webhooks/${HOOK.id}`));
  });
});
