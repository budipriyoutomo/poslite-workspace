import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { PricesScreen } from "./PricesScreen";

const OUTLET = { id: "01K5ZO00000000000000000001", code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta" };
const ROWS = [
  { product_id: "01K5ZP00000000000000000001", name: "Es Teh", base_price: 5000, price: null, effective_price: 5000, is_available: true },
  { product_id: "01K5ZP00000000000000000002", name: "Kopi Susu", base_price: 18000, price: 20000, effective_price: 20000, is_available: true },
];

function server() {
  return renderWithApi(<PricesScreen />, ({ method, path, body }) => {
    if (path === "/api/v1/outlets") return envelope([OUTLET]);
    if (method === "GET" && path === `/api/v1/outlets/${OUTLET.id}/products`) return envelope(ROWS);
    if (method === "PUT" && path.startsWith(`/api/v1/outlets/${OUTLET.id}/products/`)) return envelope({ ...ROWS[0], ...(body as object) });
    return undefined;
  });
}

const row = async (name: string) => (await screen.findByRole("cell", { name })).closest("tr")!;
const puts = <C extends { method: string }>(calls: C[]) => calls.filter((c) => c.method === "PUT");

describe("PricesScreen", () => {
  it("shows each product's base price and the outlet price", async () => {
    server();
    const kopi = within(await row("Kopi Susu"));
    expect(kopi.getByText("Rp 18.000")).toBeInTheDocument();
    expect(kopi.getByLabelText("Harga di outlet Kopi Susu")).toHaveValue("20.000");
    expect(within(await row("Es Teh")).getByLabelText("Harga di outlet Es Teh")).toHaveValue("");
  });

  it("saves an outlet price as integer Rupiah", async () => {
    const { calls } = server();
    const esTeh = within(await row("Es Teh"));
    await userEvent.type(esTeh.getByLabelText("Harga di outlet Es Teh"), "6000");
    await userEvent.click(esTeh.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]).toMatchObject({ path: `/api/v1/outlets/${OUTLET.id}/products/${ROWS[0]!.product_id}`, body: { price: 6000, is_available: true } });
  });

  it("clearing the outlet price falls back to the base price (price null)", async () => {
    const { calls } = server();
    const kopi = within(await row("Kopi Susu"));
    await userEvent.clear(kopi.getByLabelText("Harga di outlet Kopi Susu"));
    await userEvent.click(kopi.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]!.body).toEqual({ price: null, is_available: true });
  });

  it("marks a product unavailable at this outlet", async () => {
    const { calls } = server();
    const esTeh = within(await row("Es Teh"));
    await userEvent.click(esTeh.getByRole("switch", { name: "Tersedia Es Teh" }));

    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]!.body).toEqual({ price: null, is_available: false });
  });

  it("disables Simpan until the price changes", async () => {
    server();
    expect(within(await row("Es Teh")).getByRole("button", { name: "Simpan" })).toBeDisabled();
  });
});
