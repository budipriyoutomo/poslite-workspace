import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { useOperatorStore } from "../application/session-store";
import { OperatorLogin } from "./OperatorLogin";

beforeEach(() => useOperatorStore.getState().signOut());

async function signIn(password: string) {
  const result = renderWithApi(<OperatorLogin />, ({ body }) => {
    if ((body as { password: string }).password === "benar-sekali") return envelope({ token: "op-token", expires_at: "2099-01-01T00:00:00Z" });
    return { status: 401, body: { message: "Email or password is wrong", code: "INVALID_CREDENTIALS" } };
  });
  await userEvent.type(screen.getByLabelText("Email"), "ops@poslite.id");
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Masuk" }));
  return result;
}

describe("OperatorLogin", () => {
  it("signs an operator in to the console", async () => {
    const { calls } = await signIn("benar-sekali");

    await waitFor(() => expect(useOperatorStore.getState().session?.token).toBe("op-token"));
    expect(calls[0]).toMatchObject({ path: "/api/v1/platform/auth/login", body: { email: "ops@poslite.id", password: "benar-sekali" } });
  });

  it("shows wrong credentials without signing in", async () => {
    await signIn("salah");

    expect(await screen.findByRole("alert")).toHaveTextContent("Email atau password salah");
    expect(useOperatorStore.getState().session).toBeNull();
  });
});
