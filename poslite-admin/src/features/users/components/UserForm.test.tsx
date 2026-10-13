import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { UserForm } from "./UserForm";

const MAHARASA = { id: "01K5ZB00000000000000000001", code: "MAHARASA", name: "Maharasa", logo_key: null, logo_url: null, receipt_header: "", receipt_footer: "", is_active: true };
const SUSHI = { ...MAHARASA, id: "01K5ZB00000000000000000002", code: "SUSHI", name: "Sushi" };
const KEMANG = { id: "01K5ZO00000000000000000001", brand_id: MAHARASA.id, code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta" };
const DAGO = { id: "01K5ZO00000000000000000002", brand_id: SUSHI.id, code: "BDG01", name: "Dago", timezone: "Asia/Jakarta" };
const SITI = {
  id: "01K5ZU00000000000000000001",
  name: "Siti",
  email: null,
  has_pin: true,
  is_active: true,
  assignments: [{ role: "cashier" as const, scope_type: "outlet" as const, brand_id: MAHARASA.id, outlet_id: KEMANG.id }],
  outlets: [{ outlet_id: KEMANG.id, role: "cashier" as const }],
};

function server(user?: typeof SITI, reply?: { status: number; body: unknown }) {
  return renderWithApi(<UserForm user={user} onDone={vi.fn()} />, ({ method, path, body }) => {
    if (path === "/api/v1/outlets") return envelope([KEMANG, DAGO]);
    if (path === "/api/v1/brands") return envelope([MAHARASA, SUSHI]);
    if (method === "POST" && path === "/api/v1/users") return reply ?? { status: 201, ...envelope({ id: "U1", ...(body as object) }) };
    if (method === "PUT") return reply ?? envelope(null);
    return undefined;
  });
}

const sent = (calls: { method: string; path: string; body: unknown }[], method: string, path?: string) =>
  calls.find((c) => c.method === method && (path === undefined || c.path === path))?.body;

describe("UserForm (ADR-022 assignments)", () => {
  it("creates a cashier with only a PIN, at the first outlet by default", async () => {
    const { calls } = server();
    await screen.findByRole("option", { name: "Outlet Sushi · Dago" });
    await userEvent.type(screen.getByLabelText("Nama"), "Budi");
    await userEvent.type(screen.getByLabelText("PIN"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(sent(calls, "POST")).toBeDefined());
    expect(sent(calls, "POST")).toEqual({
      name: "Budi",
      email: null,
      password: null,
      pin: "123456",
      assignments: [{ role: "cashier", scope_type: "outlet", brand_id: null, outlet_id: KEMANG.id }],
      outlets: [],
    });
  });

  it("gives a brand manager a back-office login for one brand", async () => {
    const { calls } = server();
    await screen.findByRole("option", { name: "Brand Sushi" });
    await userEvent.type(screen.getByLabelText("Nama"), "Rina");
    await userEvent.selectOptions(screen.getByLabelText("Peran 1"), "manager");
    await userEvent.selectOptions(screen.getByLabelText("Cakupan 1"), `brand:${SUSHI.id}`);
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Email"), "rina@kopi.id");
    await userEvent.type(screen.getByLabelText("Password"), "rahasia123");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(sent(calls, "POST")).toBeDefined());
    expect(sent(calls, "POST")).toMatchObject({
      email: "rina@kopi.id",
      assignments: [{ role: "manager", scope_type: "brand", brand_id: SUSHI.id, outlet_id: null }],
    });
  });

  it("holds several assignments and explains a rule a row breaks", async () => {
    server();
    await screen.findByRole("option", { name: "Brand Sushi" });
    await userEvent.type(screen.getByLabelText("Nama"), "Budi");
    await userEvent.type(screen.getByLabelText("PIN"), "1234");
    await userEvent.click(screen.getByRole("button", { name: "Tambah penugasan" }));
    await userEvent.selectOptions(screen.getByLabelText("Cakupan 2"), "company");

    expect(screen.getByText("Kasir bekerja di brand atau outlet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Hapus penugasan 2" }));
    expect(screen.getByRole("button", { name: "Simpan" })).toBeEnabled();
  });

  it("rejects a PIN that is not 4–6 digits", async () => {
    server();
    await screen.findByRole("option", { name: "Brand Sushi" });
    await userEvent.type(screen.getByLabelText("Nama"), "Budi");
    await userEvent.type(screen.getByLabelText("PIN"), "12");

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it("edits name and status, then replaces the assignments", async () => {
    const { calls } = server(SITI);
    await screen.findByRole("option", { name: "Brand Sushi" });
    expect(screen.getByLabelText("Cakupan 1")).toHaveValue(`outlet:${KEMANG.id}`);
    await userEvent.selectOptions(screen.getByLabelText("Cakupan 1"), `brand:${MAHARASA.id}`);
    await userEvent.click(screen.getByRole("checkbox", { name: "Aktif" }));
    expect(screen.queryByLabelText("PIN")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(sent(calls, "PUT", `/api/v1/users/${SITI.id}/assignments`)).toBeDefined());
    expect(sent(calls, "PUT", `/api/v1/users/${SITI.id}`)).toEqual({ name: "Siti", is_active: false });
    expect(sent(calls, "PUT", `/api/v1/users/${SITI.id}/assignments`)).toEqual({
      assignments: [{ role: "cashier", scope_type: "brand", brand_id: MAHARASA.id, outlet_id: null }],
    });
  });

  it("explains that the company needs another owner", async () => {
    server({ ...SITI, assignments: [{ role: "owner", scope_type: "company", brand_id: null, outlet_id: null }] } as unknown as typeof SITI, {
      status: 409,
      body: { message: "needs owner", code: "LAST_OWNER" },
    });
    await screen.findByRole("option", { name: "Brand Sushi" });
    await userEvent.selectOptions(screen.getByLabelText("Peran 1"), "manager");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText("Perusahaan butuh pemilik lain dulu")).toBeInTheDocument();
  });
});
