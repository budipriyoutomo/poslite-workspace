import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionStore } from "@/features/auth";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { NewOutletForm } from "./NewOutletForm";

function server(reply?: { status: number; body: unknown }) {
  const onCreated = vi.fn();
  const result = renderWithApi(<NewOutletForm onCreated={onCreated} />, ({ method, body }) => {
    if (method === "POST") return reply ?? { status: 201, ...envelope({ id: "01K5ZO00000000000000000002", ...(body as object) }) };
    return undefined;
  });
  return { ...result, onCreated };
}

const AUTH = { token: "tok", expires_at: "2099-01-01T00:00:00Z", user: { id: "U", name: "Budi", role: "owner" }, tenant: { id: "T", slug: "m", name: "Warung", status: "active" } };

beforeEach(() => {
  useSessionStore.getState().signIn(AUTH);
  useSessionStore.getState().selectBrand("01K5ZB00000000000000000001");
});

describe("NewOutletForm", () => {
  it("creates an outlet of the active brand with an upper-case code and selects it", async () => {
    const { calls, onCreated } = server();
    await userEvent.type(screen.getByLabelText("Kode"), "bdg01");
    await userEvent.type(screen.getByLabelText("Nama outlet"), "Dago");
    await userEvent.selectOptions(screen.getByLabelText("Zona waktu"), "Asia/Makassar");
    await userEvent.click(screen.getByRole("button", { name: "Buat outlet" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("01K5ZO00000000000000000002"));
    expect(calls[0]!.body).toEqual({ brand_id: "01K5ZB00000000000000000001", code: "BDG01", name: "Dago", timezone: "Asia/Makassar" });
  });

  it("explains a code that is already used", async () => {
    server({ status: 409, body: { message: "Outlet code is already used", code: "OUTLET_CODE_TAKEN" } });
    await userEvent.type(screen.getByLabelText("Kode"), "JKT01");
    await userEvent.type(screen.getByLabelText("Nama outlet"), "Kemang 2");
    await userEvent.click(screen.getByRole("button", { name: "Buat outlet" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Kode outlet sudah dipakai");
  });
});
