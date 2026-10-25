import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { ChannelsScreen } from "./ChannelsScreen";

const channel = (over: object) => ({
  id: "01K5ZH00000000000000000002",
  code: "TAKE_AWAY",
  name: "Take Away",
  kind: "take_away",
  price_mode: "base",
  markup_bps: 0,
  markup_rounding_unit: 100,
  default_payment_method_id: null,
  applies_service: true,
  applies_tax: true,
  requires_external_ref: false,
  is_active: true,
  sort_order: 2,
  prices: [],
  ...over,
});
const SHOPEE = channel({ id: "01K5ZH00000000000000000003", code: "SHOPEE", name: "ShopeeFood", kind: "delivery", price_mode: "price_list", sort_order: 3 });
const PRODUCT = { id: "01K5ZP00000000000000000001", category_id: "C", sku: "MN-1", name: "Es Teh", price: 5000, image_key: null, image_url: null, is_available: true, modifier_group_ids: [] };
const QRIS = { id: "01K5ZY00000000000000000002", type: "qris", name: "QRIS", requires_reference: false, sort_order: 2, is_active: true, outlet_ids: [] };

function server() {
  return renderWithApi(<ChannelsScreen />, ({ method, path, body }) => {
    if (method === "GET" && path === "/api/v1/sales-channels") return envelope([channel({}), SHOPEE]);
    if (method === "GET" && path.startsWith("/api/v1/products")) return envelope([PRODUCT]);
    if (method === "GET" && path.startsWith("/api/v1/payment-methods")) return envelope([QRIS]);
    if (method === "POST") return { status: 201, ...envelope({ ...channel(body as object), id: "NEW" }) };
    if (method === "PUT" && path.endsWith("/prices")) return envelope({ ...SHOPEE, ...(body as object) });
    if (method === "PUT") return envelope({ ...channel({}), ...(body as object) });
    return undefined;
  });
}

describe("ChannelsScreen (ADR-029)", () => {
  it("lists the brand's channels with how each one prices the menu", async () => {
    server();

    expect(within(await screen.findByRole("listitem", { name: "Take Away" })).getByText(/Harga menu/)).toBeInTheDocument();
    expect(within(screen.getByRole("listitem", { name: "ShopeeFood" })).getByText(/Daftar harga sendiri/)).toBeInTheDocument();
  });

  it("adds a delivery channel with a markup, its payment method and the app's order number", async () => {
    const { calls } = server();
    await userEvent.click(await screen.findByRole("button", { name: "Tambah channel" }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.type(within(dialog).getByLabelText("Kode"), "gofood");
    await userEvent.type(within(dialog).getByLabelText("Nama"), "GoFood");
    await userEvent.selectOptions(within(dialog).getByLabelText("Jenis"), "delivery");
    await userEvent.selectOptions(within(dialog).getByLabelText("Harga"), "markup_bps");
    await userEvent.type(within(dialog).getByLabelText("Markup (%)"), "20");
    await userEvent.clear(within(dialog).getByLabelText("Dibulatkan ke atas (Rp)"));
    await userEvent.type(within(dialog).getByLabelText("Dibulatkan ke atas (Rp)"), "500");
    await userEvent.selectOptions(within(dialog).getByLabelText("Metode bayar default"), "QRIS");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Kena service charge" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Wajib nomor order aplikasi" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        code: "GOFOOD",
        name: "GoFood",
        kind: "delivery",
        price_mode: "markup_bps",
        markup_bps: 2000,
        markup_rounding_unit: 500,
        default_payment_method_id: QRIS.id,
        applies_service: false,
        applies_tax: true,
        requires_external_ref: true,
        is_active: true,
        sort_order: 0,
      }),
    );
  });

  it("sets a price-list channel's prices; an empty price is not sold there", async () => {
    const { calls } = server();
    await userEvent.click(within(await screen.findByRole("listitem", { name: "ShopeeFood" })).getByRole("button", { name: "Harga ShopeeFood" }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.type(within(dialog).getByLabelText("Harga Es Teh"), "7000");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan harga" }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")).toMatchObject({ path: `/api/v1/sales-channels/${SHOPEE.id}/prices`, body: { prices: [{ product_id: PRODUCT.id, price: 7000 }] } }),
    );
  });
});
