import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { UserSearchScreen } from "./UserSearchScreen";

const HIT = {
  id: "01K5ZU00000000000000000001",
  name: "Budi",
  email: "budi@maharasa.id",
  roles: ["owner"],
  is_active: true,
  tenant_id: "01K5ZT00000000000000000001",
  tenant_name: "Warung Maharasa",
  tenant_slug: "maharasa",
};

describe("UserSearchScreen", () => {
  it("finds users across tenants and links to their tenant", async () => {
    const { calls } = renderWithApi(<UserSearchScreen />, ({ path }) => (path === "/api/v1/platform/users?q=budi" ? envelope([HIT]) : undefined));

    await userEvent.type(screen.getByRole("searchbox", { name: "Cari user" }), "budi{Enter}");

    const row = within((await screen.findByText("budi@maharasa.id")).closest("tr")!);
    expect(row.getByText("Owner")).toBeInTheDocument();
    expect(row.getByRole("link", { name: "Warung Maharasa" })).toHaveAttribute("href", `/tenants/${HIT.tenant_id}`);
    expect(calls).toHaveLength(1);
  });

  it("asks for at least two characters before searching", async () => {
    const { calls } = renderWithApi(<UserSearchScreen />, () => undefined);

    await userEvent.type(screen.getByRole("searchbox", { name: "Cari user" }), "b{Enter}");

    expect(screen.getByText("Ketik minimal 2 huruf.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("says when nobody matches", async () => {
    renderWithApi(<UserSearchScreen />, () => envelope([]));

    await userEvent.type(screen.getByRole("searchbox", { name: "Cari user" }), "zzz{Enter}");

    await waitFor(() => expect(screen.getByText("Tidak ada user yang cocok.")).toBeInTheDocument());
  });
});
