import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { BrandsScreen } from "./BrandsScreen";

const POLICY = { percentages: [5, 10, 15, 20], amounts: [5000, 10000, 25000, 50000], allow_custom: true, cashier_max_percentage: 20, cashier_max_amount: 50000 };
const MAHARASA = { id: "01K5ZB00000000000000000001", code: "MAHARASA", name: "Warung Maharasa", logo_key: null, logo_url: null, receipt_header: "", receipt_footer: "", is_active: true, discount: POLICY, price_includes_tax: false };

function server(reply: (method: string, path: string, body: unknown) => { status?: number; body: unknown } | undefined = () => undefined) {
  return renderWithApi(<BrandsScreen />, ({ method, path, body }) => reply(method, path, body) ?? (path === "/api/v1/brands" && method === "GET" ? envelope([MAHARASA]) : undefined));
}

describe("BrandsScreen (ADR-022)", () => {
  it("lists the company's brands", async () => {
    server();

    expect(await screen.findByRole("row", { name: /MAHARASA/ })).toHaveTextContent("Warung Maharasa");
  });

  it("creates a brand with an upper-case code and its receipt text", async () => {
    const { calls } = server((method, _path, body) => (method === "POST" ? { status: 201, ...envelope({ ...MAHARASA, ...(body as object), id: "01K5ZB00000000000000000002" }) } : undefined));
    await userEvent.click(await screen.findByRole("button", { name: "Tambah brand" }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.type(within(dialog).getByLabelText("Kode"), "sushi");
    await userEvent.type(within(dialog).getByLabelText("Nama brand"), "Maharasa Sushi");
    await userEvent.type(within(dialog).getByLabelText("Header struk"), "Maharasa Sushi");
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        code: "SUSHI",
        name: "Maharasa Sushi",
        logo_key: null,
        receipt_header: "Maharasa Sushi",
        receipt_footer: "",
        is_active: true,
        discount: POLICY,
        price_includes_tax: false,
      }),
    );
  });

  it("sets the brand's discount presets and cashier limits (06 Order rule 5)", async () => {
    const { calls } = server((method) => (method === "PUT" ? envelope(MAHARASA) : undefined));
    await userEvent.click(await screen.findByRole("button", { name: "Ubah Warung Maharasa" }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.clear(within(dialog).getByLabelText("Pilihan diskon persen"));
    await userEvent.type(within(dialog).getByLabelText("Pilihan diskon persen"), "5, 10");
    await userEvent.clear(within(dialog).getByLabelText("Batas kasir (%)"));
    await userEvent.type(within(dialog).getByLabelText("Batas kasir (%)"), "10");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Kasir boleh mengetik nilai sendiri" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({
        discount: { percentages: [5, 10], amounts: [5000, 10000, 25000, 50000], allow_custom: false, cashier_max_percentage: 10, cashier_max_amount: 50000 },
      }),
    );
  });

  it("switches the brand to prices that include tax, warning it applies to new sales only (ADR-030)", async () => {
    const { calls } = server((method) => (method === "PUT" ? envelope(MAHARASA) : undefined));
    await userEvent.click(await screen.findByRole("button", { name: "Ubah Warung Maharasa" }));
    const dialog = await screen.findByRole("dialog");

    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Harga menu sudah termasuk service & PB1" }));
    expect(within(dialog).getByText(/hanya untuk transaksi baru/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ price_includes_tax: true }));
  });

  it("explains why a brand with outlets cannot be deleted", async () => {
    server((method) => (method === "DELETE" ? { status: 409, body: { message: "has outlets", code: "BRAND_HAS_OUTLETS" } } : undefined));
    await userEvent.click(await screen.findByRole("button", { name: "Hapus Warung Maharasa" }));
    await userEvent.click(await screen.findByRole("button", { name: "Hapus" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Tutup atau pindahkan outlet brand ini dulu");
  });
});
