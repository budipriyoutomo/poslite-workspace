import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { OperatorsScreen } from "./OperatorsScreen";

const ME = { id: "01K5ZX00000000000000000001", email: "ops@poslite.id", name: "Ops", created_at: "2026-09-01T00:00:00Z", disabled_at: null };
const RINA = { id: "01K5ZX00000000000000000002", email: "rina@poslite.id", name: "Rina", created_at: "2026-09-02T00:00:00Z", disabled_at: null };
const OLD = { id: "01K5ZX00000000000000000003", email: "old@poslite.id", name: "Lama", created_at: "2026-09-03T00:00:00Z", disabled_at: "2026-10-01T00:00:00Z" };

function server(post: (path: string) => { status?: number; body: unknown } | undefined = () => envelope(RINA)) {
  return renderWithApi(<OperatorsScreen />, ({ method, path }) => {
    if (method === "GET" && path === "/api/v1/platform/me") return envelope(ME);
    if (method === "GET" && path === "/api/v1/platform/operators") return envelope([ME, RINA, OLD]);
    if (method === "POST") return post(path);
    return undefined;
  });
}

const row = async (email: string) => within((await screen.findByText(email)).closest("tr")!);

describe("OperatorsScreen", () => {
  it("lists operators without a disable button for oneself", async () => {
    server();

    expect((await row("ops@poslite.id")).queryByRole("button", { name: /Nonaktifkan/ })).not.toBeInTheDocument();
    expect((await row("ops@poslite.id")).getByText("Anda")).toBeInTheDocument();
    expect((await row("rina@poslite.id")).getByRole("button", { name: "Nonaktifkan Rina" })).toBeInTheDocument();
    expect((await row("old@poslite.id")).getByText("Nonaktif")).toBeInTheDocument();
  });

  it("adds an operator", async () => {
    const { calls } = server();
    await row("ops@poslite.id");

    await userEvent.click(screen.getByRole("button", { name: "Tambah operator" }));
    await userEvent.type(screen.getByLabelText("Nama"), "Sari");
    await userEvent.type(screen.getByLabelText("Email"), "sari@poslite.id");
    await userEvent.type(screen.getByLabelText("Password"), "sari-rahasia-123");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")).toMatchObject({
        path: "/api/v1/platform/operators",
        body: { name: "Sari", email: "sari@poslite.id", password: "sari-rahasia-123" },
      }),
    );
  });

  it("requires a password of at least 12 characters", async () => {
    const { calls } = server();
    await row("ops@poslite.id");

    await userEvent.click(screen.getByRole("button", { name: "Tambah operator" }));
    await userEvent.type(screen.getByLabelText("Nama"), "Sari");
    await userEvent.type(screen.getByLabelText("Email"), "sari@poslite.id");
    await userEvent.type(screen.getByLabelText("Password"), "pendek");

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("shows a taken email", async () => {
    server(() => ({ status: 409, body: { message: "Another operator uses this email", code: "OPERATOR_EMAIL_TAKEN" } }));
    await row("ops@poslite.id");

    await userEvent.click(screen.getByRole("button", { name: "Tambah operator" }));
    await userEvent.type(screen.getByLabelText("Nama"), "Rina");
    await userEvent.type(screen.getByLabelText("Email"), "rina@poslite.id");
    await userEvent.type(screen.getByLabelText("Password"), "rina-rahasia-123");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email sudah dipakai operator lain");
  });

  it("disables an operator after confirmation and enables a disabled one", async () => {
    const { calls } = server();

    await userEvent.click((await row("rina@poslite.id")).getByRole("button", { name: "Nonaktifkan Rina" }));
    await userEvent.click(await screen.findByRole("button", { name: "Nonaktifkan" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.path).toBe(`/api/v1/platform/operators/${RINA.id}/disable`));

    await userEvent.click((await row("old@poslite.id")).getByRole("button", { name: "Aktifkan Lama" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST").at(-1)?.path).toBe(`/api/v1/platform/operators/${OLD.id}/enable`));
  });
});
