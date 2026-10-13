import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { renderWithApi } from "../../../../tests/support/render";
import { useOperatorStore } from "../application/session-store";
import { ConsoleGate } from "./ConsoleGate";

const renderGate = () =>
  renderWithApi(
    <ConsoleGate>
      <p>Daftar tenant</p>
    </ConsoleGate>,
    () => undefined,
  );

beforeEach(() => useOperatorStore.getState().signOut());

describe("ConsoleGate", () => {
  it("asks a signed-out operator to log in", () => {
    renderGate();

    expect(screen.getByRole("button", { name: "Masuk" })).toBeInTheDocument();
    expect(screen.queryByText("Daftar tenant")).not.toBeInTheDocument();
  });

  it("treats an expired session as signed out", () => {
    useOperatorStore.getState().signIn({ token: "op", expiresAt: "2000-01-01T00:00:00Z" });
    renderGate();

    expect(screen.getByRole("button", { name: "Masuk" })).toBeInTheDocument();
  });

  it("shows the console to a signed-in operator", () => {
    useOperatorStore.getState().signIn({ token: "op", expiresAt: "2099-01-01T00:00:00Z" });
    renderGate();

    expect(screen.getByText("Daftar tenant")).toBeInTheDocument();
  });
});
