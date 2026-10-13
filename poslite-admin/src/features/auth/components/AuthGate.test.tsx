import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { useSessionStore } from "../application/session-store";
import { AuthGate } from "./AuthGate";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: replace }) }));

const AUTH = { token: "tok", expires_at: "2099-01-01T00:00:00Z", user: { id: "U", name: "Budi", role: "owner" }, tenant: { id: "T", slug: "m", name: "Warung", status: "active" } };
const ACCESS = {
  tenant: { id: "T", name: "Warung", status: "active" },
  company_scope: true,
  brands: [
    { id: "B1", code: "MAHARASA", name: "Maharasa", role: "owner", outlets: [] },
    { id: "B2", code: "SUSHI", name: "Sushi", role: "owner", outlets: [] },
  ],
};

beforeEach(() => {
  replace.mockReset();
  useSessionStore.getState().signOut();
});

describe("AuthGate", () => {
  it("makes the first brand of the access tree active before showing the page (ADR-022)", async () => {
    useSessionStore.getState().signIn(AUTH);

    renderWithApi(
      <AuthGate>
        <p>Dashboard</p>
      </AuthGate>,
      ({ path }) => (path === "/api/v1/me/access" ? envelope(ACCESS) : undefined),
    );

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(useSessionStore.getState().session?.brandId).toBe("B1");
  });

  it("keeps a brand that is already active", async () => {
    useSessionStore.getState().signIn(AUTH);
    useSessionStore.getState().selectBrand("B2");

    renderWithApi(
      <AuthGate>
        <p>Dashboard</p>
      </AuthGate>,
      () => envelope(ACCESS),
    );

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(useSessionStore.getState().session?.brandId).toBe("B2");
  });

  it("moves to the first brand when the active one is no longer allowed", async () => {
    useSessionStore.getState().signIn(AUTH);
    useSessionStore.getState().selectBrand("B9");

    renderWithApi(
      <AuthGate>
        <p>Dashboard</p>
      </AuthGate>,
      () => envelope(ACCESS),
    );

    await waitFor(() => expect(useSessionStore.getState().session?.brandId).toBe("B1"));
  });
});
