import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { useOperatorStore } from "../application/session-store";
import { ConsoleShell } from "./ConsoleShell";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const ME = { id: "01K5ZX00000000000000000001", email: "ops@poslite.id", name: "Ops Satu", created_at: "2026-09-01T00:00:00Z", disabled_at: null };

beforeEach(() => useOperatorStore.getState().signIn({ token: "op", expiresAt: "2099-01-01T00:00:00Z" }));

const renderShell = () =>
  renderWithApi(
    <ConsoleShell>
      <p>Isi halaman</p>
    </ConsoleShell>,
    ({ path }) => (path === "/api/v1/platform/me" ? envelope(ME) : undefined),
  );

describe("ConsoleShell", () => {
  it("shows the signed-in operator and the page", async () => {
    renderShell();

    expect(await screen.findByText("Ops Satu")).toBeInTheDocument();
    expect(screen.getByText("Isi halaman")).toBeInTheDocument();
  });

  it("marks the current section, including its sub pages", () => {
    pathname.current = "/tenants/01K5ZT00000000000000000001";
    renderShell();

    expect(screen.getByRole("link", { name: "Tenant" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Ringkasan" })).not.toHaveAttribute("aria-current");
  });

  it("signs out", async () => {
    renderShell();

    await userEvent.click(screen.getByRole("button", { name: "Keluar" }));

    expect(useOperatorStore.getState().session).toBeNull();
  });
});
