import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { SignupScreen } from "./SignupScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: push, push }) }));

const AUTH = { token: "tok", expires_at: "2099-01-01T00:00:00Z", user: { id: "U", name: "Budi", role: "owner" }, tenant: { id: "T", slug: "warung-maharasa", name: "Warung Maharasa", status: "active" } };

describe("SignupScreen", () => {
  it("creates the business, owner and first outlet, deriving the slug from the name", async () => {
    const { calls } = renderWithApi(<SignupScreen />, ({ path }) => (path === "/api/v1/tenants/signup" ? envelope(AUTH) : undefined));

    await userEvent.type(screen.getByLabelText("Nama usaha"), "Warung Maharasa");
    await userEvent.type(screen.getByLabelText("Nama Anda"), "Budi");
    await userEvent.type(screen.getByLabelText("Email"), "budi@maharasa.id");
    await userEvent.type(screen.getByLabelText("Password"), "rahasia-123");
    await userEvent.type(screen.getByLabelText("Kode outlet"), "jkt01");
    await userEvent.type(screen.getByLabelText("Nama outlet"), "Kemang");
    await userEvent.click(screen.getByRole("button", { name: "Buat akun" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(calls[0]!.body).toEqual({
      business_name: "Warung Maharasa",
      slug: "warung-maharasa",
      owner_name: "Budi",
      email: "budi@maharasa.id",
      password: "rahasia-123",
      outlet: { code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta" },
    });
  });

  it("shows which field the server rejected", async () => {
    renderWithApi(<SignupScreen />, () => ({ status: 409, body: { message: "taken", code: "SLUG_TAKEN" } }));

    await userEvent.type(screen.getByLabelText("Nama usaha"), "Warung");
    await userEvent.type(screen.getByLabelText("Nama Anda"), "Budi");
    await userEvent.type(screen.getByLabelText("Email"), "budi@maharasa.id");
    await userEvent.type(screen.getByLabelText("Password"), "rahasia-123");
    await userEvent.type(screen.getByLabelText("Kode outlet"), "JKT01");
    await userEvent.type(screen.getByLabelText("Nama outlet"), "Kemang");
    await userEvent.click(screen.getByRole("button", { name: "Buat akun" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Nama usaha ini sudah dipakai");
  });
});
