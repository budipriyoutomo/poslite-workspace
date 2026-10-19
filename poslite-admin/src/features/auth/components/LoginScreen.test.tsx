import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { useSessionStore } from "../application/session-store";
import { LoginScreen } from "./LoginScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: push, push }) }));

const AUTH = { token: "tok", expires_at: "2099-01-01T00:00:00Z", user: { id: "U", name: "Budi", role: "owner" }, tenant: { id: "T", slug: "m", name: "Warung", status: "active" } };

beforeEach(() => {
  push.mockReset();
  useSessionStore.getState().signOut();
});

async function fillAndSubmit(email: string, password: string) {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
}

describe("LoginScreen", () => {
  it("signs in and goes to the dashboard", async () => {
    const { calls } = renderWithApi(<LoginScreen />, ({ path }) => (path === "/api/v1/auth/login" ? envelope(AUTH) : undefined));

    await fillAndSubmit("budi@maharasa.id", "rahasia-123");

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(calls[0]).toMatchObject({ method: "POST", body: { email: "budi@maharasa.id", password: "rahasia-123" } });
    expect(useSessionStore.getState().session?.tenant.name).toBe("Warung");
  });

  it("asks to wait after too many attempts (ADR-027)", async () => {
    renderWithApi(<LoginScreen />, () => ({ status: 429, body: { message: "Too many attempts", code: "RATE_LIMITED" } }));

    await fillAndSubmit("budi@maharasa.id", "salah");

    expect(await screen.findByRole("alert")).toHaveTextContent("Terlalu banyak percobaan");
  });

  it("explains wrong credentials", async () => {
    renderWithApi(<LoginScreen />, () => ({ status: 401, body: { message: "wrong", code: "INVALID_CREDENTIALS" } }));

    await fillAndSubmit("budi@maharasa.id", "salah");

    expect(await screen.findByRole("alert")).toHaveTextContent("Email atau password salah");
    expect(push).not.toHaveBeenCalled();
  });
});
