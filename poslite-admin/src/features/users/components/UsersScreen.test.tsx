import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { UsersScreen } from "./UsersScreen";

const BRAND = { id: "01K5ZB00000000000000000001", code: "MAHARASA", name: "Maharasa", logo_key: null, logo_url: null, receipt_header: "", receipt_footer: "", is_active: true };
const KEMANG = { id: "01K5ZO00000000000000000001", brand_id: BRAND.id, code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta" };
const OWNER = {
  id: "01K5ZU00000000000000000001",
  name: "Budi",
  email: "budi@kopi.id",
  has_pin: false,
  is_active: true,
  assignments: [{ role: "owner", scope_type: "company", brand_id: null, outlet_id: null }],
  outlets: [{ outlet_id: KEMANG.id, role: "owner" }],
};
const SITI = {
  id: "01K5ZU00000000000000000002",
  name: "Siti",
  email: null,
  has_pin: true,
  is_active: false,
  assignments: [{ role: "cashier", scope_type: "outlet", brand_id: BRAND.id, outlet_id: KEMANG.id }],
  outlets: [{ outlet_id: KEMANG.id, role: "cashier" }],
};

function server(deleteReply?: { status: number; body: unknown }) {
  return renderWithApi(<UsersScreen />, ({ method, path }) => {
    if (path === "/api/v1/outlets") return envelope([KEMANG]);
    if (path === "/api/v1/brands") return envelope([BRAND]);
    if (method === "GET" && path === "/api/v1/users") return envelope([OWNER, SITI]);
    if (method === "PUT") return envelope(null);
    if (method === "DELETE") return deleteReply ?? envelope(null);
    return undefined;
  });
}

const row = async (name: string) => within((await screen.findByRole("cell", { name })).closest("tr")!);

describe("UsersScreen", () => {
  it("lists users with their assignments and status", async () => {
    server();
    const siti = await row("Siti");
    expect(await siti.findByText("Kasir · Kemang")).toBeInTheDocument();
    expect((await row("Budi")).getByText("Pemilik · Seluruh perusahaan")).toBeInTheDocument();
    expect(siti.getByText("Nonaktif")).toBeInTheDocument();
    expect((await row("Budi")).getByText("budi@kopi.id")).toBeInTheDocument();
  });

  it("changes a cashier's PIN", async () => {
    const { calls } = server();
    await userEvent.click((await row("Siti")).getByRole("button", { name: "Ganti PIN Siti" }));
    await userEvent.type(await screen.findByLabelText("PIN baru"), "9876");
    await userEvent.click(screen.getByRole("button", { name: "Simpan PIN" }));

    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toMatchObject({ path: `/api/v1/users/${SITI.id}/pin`, body: { pin: "9876" } }));
  });

  it("explains why you cannot delete yourself", async () => {
    server({ status: 409, body: { message: "Cannot delete yourself", code: "CANNOT_DELETE_SELF" } });
    await userEvent.click((await row("Budi")).getByRole("button", { name: "Hapus Budi" }));
    await userEvent.click(await screen.findByRole("button", { name: "Hapus" }));

    expect(await screen.findByText("Tidak bisa menghapus akun sendiri")).toBeInTheDocument();
  });

  it("explains why the last owner cannot be deleted", async () => {
    server({ status: 409, body: { message: "The company needs another owner first", code: "LAST_OWNER" } });
    await userEvent.click((await row("Budi")).getByRole("button", { name: "Hapus Budi" }));
    await userEvent.click(await screen.findByRole("button", { name: "Hapus" }));

    expect(await screen.findByText("Perusahaan butuh pemilik lain dulu")).toBeInTheDocument();
  });
});
