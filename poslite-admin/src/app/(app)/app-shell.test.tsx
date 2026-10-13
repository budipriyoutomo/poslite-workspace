import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/features/auth", () => ({
  AuthGate: ({ children }: { children: ReactNode }) => children,
  BrandSelect: () => null,
  usePageAccess: () => ({ company: true, manageBrand: true }),
  useSessionStore: (select: (s: unknown) => unknown) => select({ session: { tenant: { name: "Kopi" }, user: { name: "Budi" } }, signOut: vi.fn() }),
}));
vi.mock("@/features/outlets", () => ({ OutletSelect: () => null }));

// On a phone the sidebar is a drawer: closed until the menu button opens it.
describe("AppShell navigation drawer", () => {
  it("starts closed", () => {
    render(<AppShell>page</AppShell>);
    expect(screen.getByRole("button", { name: "Buka menu" })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens from the menu button", async () => {
    render(<AppShell>page</AppShell>);
    await userEvent.click(screen.getByRole("button", { name: "Buka menu" }));
    expect(screen.getByRole("button", { name: "Buka menu" })).toHaveAttribute("aria-expanded", "true");
  });

  it("closes after picking a page", async () => {
    render(<AppShell>page</AppShell>);
    await userEvent.click(screen.getByRole("button", { name: "Buka menu" }));
    await userEvent.click(screen.getByRole("link", { name: "Menu" }));
    expect(screen.getByRole("button", { name: "Buka menu" })).toHaveAttribute("aria-expanded", "false");
  });

  it("closes from the backdrop", async () => {
    render(<AppShell>page</AppShell>);
    await userEvent.click(screen.getByRole("button", { name: "Buka menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Tutup menu" }));
    expect(screen.getByRole("button", { name: "Buka menu" })).toHaveAttribute("aria-expanded", "false");
  });
});
