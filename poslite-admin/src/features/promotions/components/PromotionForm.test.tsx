import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { PromotionForm } from "./PromotionForm";

const DRINKS = { id: "01K5ZC00000000000000000001", name: "Minuman", sort_order: 0, color: "", print_role: "bar" };
const KOPI = { id: "01K5ZP00000000000000000001", category_id: DRINKS.id, sku: "K1", name: "Kopi Susu", price: 18000, image_url: null, is_available: true, modifier_group_ids: [] };
const KEMANG = { id: "01K5ZO00000000000000000001", code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta" };

function server() {
  return renderWithApi(<PromotionForm onDone={vi.fn()} />, ({ method, path, body }) => {
    if (path === "/api/v1/categories") return envelope([DRINKS]);
    if (path === "/api/v1/products") return envelope([KOPI]);
    if (path.startsWith("/api/v1/outlets?brand_id=")) return envelope([KEMANG]);
    if (method === "POST") return { status: 201, ...envelope({ id: "01K5ZQ00000000000000000001", ...(body as object) }) };
    return undefined;
  });
}

const posted = (calls: { method: string; body: unknown }[]) => calls.find((c) => c.method === "POST")?.body;

describe("PromotionForm", () => {
  it("creates a weekday happy hour on a category", async () => {
    const { calls } = server();
    await userEvent.type(screen.getByLabelText("Nama promo"), "Happy hour");
    await userEvent.type(screen.getByLabelText("Diskon (%)"), "20");
    await userEvent.click(await screen.findByRole("checkbox", { name: "Kategori Minuman" }));
    for (const day of ["Sab", "Min"]) await userEvent.click(screen.getByRole("checkbox", { name: day }));
    await userEvent.type(screen.getByLabelText("Jam mulai"), "14:00");
    await userEvent.type(screen.getByLabelText("Jam selesai"), "17:00");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(posted(calls)).toBeDefined());
    expect(posted(calls)).toEqual({
      name: "Happy hour",
      type: "percent_off",
      percentage: 20,
      buy_qty: null,
      get_qty: null,
      product_ids: [],
      category_ids: [DRINKS.id],
      outlet_ids: [],
      days_of_week: [1, 2, 3, 4, 5],
      start_time: "14:00",
      end_time: "17:00",
      starts_on: null,
      ends_on: null,
      is_active: true,
    });
  });

  it("creates buy 2 get 1 on a product at one outlet", async () => {
    const { calls } = server();
    await userEvent.type(screen.getByLabelText("Nama promo"), "Beli 2 gratis 1");
    await userEvent.selectOptions(screen.getByLabelText("Jenis promo"), "buy_x_get_y");
    await userEvent.type(screen.getByLabelText("Beli"), "2");
    await userEvent.type(screen.getByLabelText("Gratis"), "1");
    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled(); // needs a product or category

    await userEvent.click(await screen.findByRole("checkbox", { name: "Produk Kopi Susu" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Outlet Kemang" }));
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(posted(calls)).toBeDefined());
    expect(posted(calls)).toMatchObject({ type: "buy_x_get_y", percentage: null, buy_qty: 2, get_qty: 1, product_ids: [KOPI.id], outlet_ids: [KEMANG.id], days_of_week: [] });
  });

  it("needs both ends of the time window", async () => {
    server();
    await userEvent.type(screen.getByLabelText("Nama promo"), "Pagi");
    await userEvent.type(screen.getByLabelText("Diskon (%)"), "10");
    await userEvent.type(screen.getByLabelText("Jam mulai"), "07:00");

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });

  it("rejects a percentage above 100", async () => {
    server();
    await userEvent.type(screen.getByLabelText("Nama promo"), "Gila");
    await userEvent.type(screen.getByLabelText("Diskon (%)"), "150");

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
  });
});
