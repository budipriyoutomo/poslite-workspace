import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { UserForm } from "./UserForm";

const KEMANG = { id: "01K5ZO00000000000000000001", code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta" };
const BSD = { id: "01K5ZO00000000000000000002", code: "TNG01", name: "BSD", timezone: "Asia/Jakarta" };
const SITI = {
  id: "01K5ZU00000000000000000001",
  name: "Siti",
  email: null,
  has_pin: true,
  is_active: true,
  outlets: [{ outlet_id: KEMANG.id, role: "cashier" as const }],
};

function server(user?: typeof SITI) {
  return renderWithApi(<UserForm user={user} onDone={vi.fn()} />, ({ method, path, body }) => {
    if (path === "/api/v1/outlets") return envelope([KEMANG, BSD]);
    if (method === "POST" && path === "/api/v1/users") return { status: 201, ...envelope({ id: "U1", has_pin: true, is_active: true, ...(body as object) }) };
    if (method === "PUT") return envelope(null);
    return undefined;
  });
}

const sent = (calls: { method: string; body: unknown }[], method: string) => calls.find((c) => c.method === method)?.body;

describe("UserForm", () => {
  it("creates a cashier with only a PIN, at the chosen outlets", async () => {
    const { calls } = server();
    await userEvent.click(await screen.findByRole("checkbox", { name: "BSD" }));
    await userEvent.type(screen.getByLabelText("Nama"), "Budi");
    await userEvent.type(screen.getByLabelText("PIN"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(sent(calls, "POST")).toBeDefined());
    expect(sent(calls, "POST")).toEqual({ name: "Budi", email: null, password: null, pin: "123456", outlets: [{ outlet_id: BSD.id, role: "cashier" }] });
  });

  it("asks a manager for email and password (back-office login)", async () => {
    const { calls } = server();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Kemang" }));
    await userEvent.type(screen.getByLabelText("Nama"), "Rina");
    await userEvent.selectOptions(screen.getByLabelText("Peran"), "manager");
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Email"), "rina@kopi.id");
    await userEvent.type(screen.getByLabelText("Kata sandi"), "rahasia123");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(sent(calls, "POST")).toBeDefined());
    expect(sent(calls, "POST")).toEqual({
      name: "Rina",
      email: "rina@kopi.id",
      password: "rahasia123",
      pin: null,
      outlets: [{ outlet_id: KEMANG.id, role: "manager" }],
    });
  });

  it("rejects a PIN that is not 4–6 digits", async () => {
    server();
    await userEvent.click(await screen.findByRole("checkbox", { name: "Kemang" }));
    await userEvent.type(screen.getByLabelText("Nama"), "Budi");
    await userEvent.type(screen.getByLabelText("PIN"), "12");

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it("needs at least one outlet", async () => {
    server();
    await screen.findByRole("checkbox", { name: "Kemang" });
    await userEvent.type(screen.getByLabelText("Nama"), "Budi");
    await userEvent.type(screen.getByLabelText("PIN"), "1234");

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it("edits name, outlets and active status without touching credentials", async () => {
    const { calls } = server(SITI);
    await userEvent.click(await screen.findByRole("checkbox", { name: "BSD" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Aktif" }));
    expect(screen.queryByLabelText("PIN")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(sent(calls, "PUT")).toBeDefined());
    expect(calls.find((c) => c.method === "PUT")!.path).toBe(`/api/v1/users/${SITI.id}`);
    expect(sent(calls, "PUT")).toEqual({
      name: "Siti",
      is_active: false,
      outlets: [
        { outlet_id: KEMANG.id, role: "cashier" },
        { outlet_id: BSD.id, role: "cashier" },
      ],
    });
  });
});
