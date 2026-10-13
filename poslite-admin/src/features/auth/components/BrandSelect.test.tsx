import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { useSessionStore } from "../application/session-store";
import { BrandSelect } from "./BrandSelect";

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
  useSessionStore.getState().signIn(AUTH);
  useSessionStore.getState().selectBrand("B1");
});

describe("BrandSelect", () => {
  it("switches the active brand and reloads brand data (ADR-022)", async () => {
    const { calls } = renderWithApi(<BrandSelect />, ({ path }) => (path === "/api/v1/me/access" ? envelope(ACCESS) : undefined));

    const select = await screen.findByLabelText("Brand");
    expect(select).toHaveValue("B1");
    await userEvent.selectOptions(select, "B2");

    expect(useSessionStore.getState().session?.brandId).toBe("B2");
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/v1/me/access")).toHaveLength(2));
  });

  it("shows nothing to pick for a single brand", async () => {
    const { calls } = renderWithApi(<BrandSelect />, () => envelope({ ...ACCESS, brands: ACCESS.brands.slice(0, 1) }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.queryByLabelText("Brand")).not.toBeInTheDocument();
    expect(screen.getByText("Maharasa")).toBeInTheDocument();
  });
});
