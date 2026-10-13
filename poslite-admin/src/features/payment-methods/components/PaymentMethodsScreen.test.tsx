import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { PaymentMethodsScreen } from "./PaymentMethodsScreen";

const KEMANG = { id: "01K5ZO00000000000000000001", brand_id: "01K5ZB00000000000000000001", code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta" };
const DAGO = { id: "01K5ZO00000000000000000002", brand_id: "01K5ZB00000000000000000002", code: "BDG01", name: "Dago", timezone: "Asia/Jakarta" };
const CASH = { id: "01K5ZM00000000000000000001", type: "cash", name: "Tunai", requires_reference: false, sort_order: 0, logo_url: null, outlet_ids: [KEMANG.id, DAGO.id] };
const QRIS = { id: "01K5ZM00000000000000000002", type: "qris", name: "QRIS BCA", requires_reference: true, sort_order: 1, logo_url: null, outlet_ids: [KEMANG.id] };

function server() {
  return renderWithApi(<PaymentMethodsScreen />, ({ method, path, body }) => {
    if (method === "GET" && path === "/api/v1/payment-methods") return envelope([CASH, QRIS]);
    if (method === "GET" && path === "/api/v1/outlets") return envelope([KEMANG, DAGO]);
    if (method === "POST") return { status: 201, ...envelope({ id: "01K5ZM00000000000000000003", ...(body as object) }) };
    if (method === "PUT") return envelope(body);
    if (method === "DELETE") return envelope(null);
    return undefined;
  });
}

const item = async (name: string) => within(await screen.findByRole("listitem", { name }));

describe("PaymentMethodsScreen", () => {
  it("lists methods with their type", async () => {
    server();
    expect((await item("QRIS BCA")).getByText("QRIS")).toBeInTheDocument();
    expect((await item("Tunai")).getAllByText("Tunai")).toHaveLength(2); // name + type
  });

  it("adds a method at the end of the list", async () => {
    const { calls } = server();
    await item("Tunai");
    await userEvent.type(screen.getByLabelText("Nama metode baru"), "Kartu Debit");
    await userEvent.selectOptions(screen.getByLabelText("Jenis"), "debit");
    await userEvent.click(screen.getByRole("button", { name: /Tambah/ }));

    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ name: "Kartu Debit", type: "debit", requires_reference: true, sort_order: 2, logo_url: null });
  });

  it("toggles whether a reference number is required", async () => {
    const { calls } = server();
    await userEvent.click((await item("Tunai")).getByRole("switch", { name: "Wajib no. referensi Tunai" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.path).toBe(`/api/v1/payment-methods/${CASH.id}`);
    expect(put.body).toEqual({ name: "Tunai", type: "cash", requires_reference: true, sort_order: 0, logo_url: null });
  });

  it("deletes a method after confirmation", async () => {
    const { calls } = server();
    await userEvent.click((await item("QRIS BCA")).getByRole("button", { name: "Hapus QRIS BCA" }));
    await userEvent.click(await screen.findByRole("button", { name: "Hapus" }));

    await waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe(`/api/v1/payment-methods/${QRIS.id}`));
  });

  it("switches a method on or off per outlet (doc 11 §3)", async () => {
    const { calls } = server();
    const dagoQris = await screen.findByRole("checkbox", { name: "QRIS BCA di Dago" });
    expect(dagoQris).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Tunai di Dago" })).toBeChecked();

    await userEvent.click(dagoQris);

    await waitFor(() =>
      expect(calls.find((c) => c.path === `/api/v1/payment-methods/${QRIS.id}/outlets`)).toMatchObject({ method: "PUT", body: { outlet_ids: [KEMANG.id, DAGO.id] } }),
    );
  });
});
