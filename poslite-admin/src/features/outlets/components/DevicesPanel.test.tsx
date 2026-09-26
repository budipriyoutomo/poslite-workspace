import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { DevicesPanel } from "./DevicesPanel";

const OUTLET = "01K5ZO00000000000000000001";
const device = (id: string, name: string, extra: object = {}) => ({
  id,
  code: "A",
  name,
  platform: "Android",
  app_version: "1.0.0",
  last_seen_at: "2026-09-20T03:00:00Z",
  revoked_at: null,
  created_at: "2026-09-01T03:00:00Z",
  ...extra,
});
const KASIR = device("01K5ZD00000000000000000001", "Tablet Kasir 1");
const LAMA = device("01K5ZD00000000000000000002", "Tablet Lama", { revoked_at: "2026-09-10T03:00:00Z", last_seen_at: null });

function server() {
  return renderWithApi(<DevicesPanel outletId={OUTLET} />, ({ method, path }) => {
    if (method === "GET" && path === `/api/v1/outlets/${OUTLET}/devices`) return envelope([KASIR, LAMA]);
    if (method === "DELETE") return envelope(null);
    return undefined;
  });
}

const row = async (name: string) => within((await screen.findByRole("cell", { name })).closest("tr")!);

describe("DevicesPanel", () => {
  it("shows active and revoked devices", async () => {
    server();
    expect((await row("Tablet Lama")).getByText("Dicabut")).toBeInTheDocument();
    expect((await row("Tablet Lama")).queryByRole("button", { name: /Cabut/ })).not.toBeInTheDocument();
    expect((await row("Tablet Kasir 1")).getByText("Aktif")).toBeInTheDocument();
  });

  it("revokes a lost tablet after confirmation", async () => {
    const { calls } = server();
    await userEvent.click((await row("Tablet Kasir 1")).getByRole("button", { name: "Cabut Tablet Kasir 1" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cabut akses" }));

    await waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe(`/api/v1/devices/${KASIR.id}`));
  });
});
