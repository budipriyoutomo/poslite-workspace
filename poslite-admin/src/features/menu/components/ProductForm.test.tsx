import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { envelope, renderWithApi, type Route } from "../../../../tests/support/render";
import type { Product } from "../application/use-menu";
import { ProductForm } from "./ProductForm";

const CATEGORIES = [{ id: "01K5ZC00000000000000000001", name: "Minuman", sort_order: 1, color: "", print_role: "bar" }];
const GROUPS = [{ id: "01K5ZG00000000000000000001", name: "Level Gula", min_select: 1, max_select: 1, options: [] }];

const IMAGE = { key: "01K5ZT00000000000000000001/products/01K5ZI00000000000000000001.jpg", url: "https://is3.cloudhost.id/poslite/01K5ZT00000000000000000001/products/01K5ZI00000000000000000001.jpg" };
const EXISTING: Product = {
  id: "01K5ZP00000000000000000001",
  category_id: CATEGORIES[0]!.id,
  sku: "MN-001",
  name: "Es Teh",
  price: 5000,
  image_key: IMAGE.key,
  image_url: IMAGE.url,
  is_available: true,
  modifier_group_ids: [],
};
const jpeg = (bytes = 10) => new File([new Uint8Array(bytes)], "teh.jpg", { type: "image/jpeg" });

function server(product?: Product, upload: () => ReturnType<Route> = () => ({ status: 201, ...envelope(IMAGE) })) {
  return renderWithApi(<ProductForm product={product} onDone={vi.fn()} />, ({ method, path, body }) => {
    if (path === "/api/v1/categories") return envelope(CATEGORIES);
    if (path === "/api/v1/modifier-groups") return envelope(GROUPS);
    if (method === "POST" && path === "/api/v1/media/images") return upload();
    if (method === "POST" && path === "/api/v1/products") return { status: 201, ...envelope({ id: "P1", ...(body as object) }) };
    if (method === "PUT") return envelope({ ...product, ...(body as object) });
    return undefined;
  });
}

const saved = (calls: { method: string; path: string; body: unknown }[]) => calls.find((c) => c.path.startsWith("/api/v1/products"))?.body as Record<string, unknown> | undefined;

describe("ProductForm", () => {
  it("creates a product with an integer price and its modifier groups", async () => {
    const { calls } = server();
    await screen.findByRole("option", { name: "Minuman", hidden: true });

    await userEvent.type(screen.getByLabelText("Nama"), "Es Teh Manis");
    await userEvent.type(screen.getByLabelText("SKU"), "MN-001");
    await userEvent.type(screen.getByLabelText("Harga"), "5000");
    await userEvent.click(screen.getByRole("checkbox", { name: "Level Gula" }));
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toBeDefined());
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({
      category_id: CATEGORIES[0]!.id,
      sku: "MN-001",
      name: "Es Teh Manis",
      price: 5000,
      image_key: null,
      is_available: true,
      modifier_group_ids: [GROUPS[0]!.id],
    });
  });

  it("does not submit without a price", async () => {
    const { calls } = server();
    await screen.findByRole("option", { name: "Minuman", hidden: true });
    await userEvent.type(screen.getByLabelText("Nama"), "Es Teh");
    await userEvent.type(screen.getByLabelText("SKU"), "MN-1");

    expect(screen.getByRole("button", { name: "Simpan" })).toBeDisabled();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("uploads the chosen image, previews it, and saves only its key", async () => {
    const { calls } = server();
    await screen.findByRole("option", { name: "Minuman", hidden: true });
    await userEvent.type(screen.getByLabelText("Nama"), "Es Teh");
    await userEvent.type(screen.getByLabelText("SKU"), "MN-1");
    await userEvent.type(screen.getByLabelText("Harga"), "5000");

    await userEvent.upload(screen.getByLabelText("Gambar produk"), jpeg());

    expect(await screen.findByRole("img", { name: "Pratinjau gambar produk" })).toHaveAttribute("src", IMAGE.url);
    expect(calls.find((c) => c.path === "/api/v1/media/images")!.body).toEqual({ type: "image/jpeg", size: 10 });
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(saved(calls)).toBeDefined());
    expect(saved(calls)!.image_key).toBe(IMAGE.key);
  });

  it("shows the current image of a product and can remove it", async () => {
    const { calls } = server(EXISTING);
    expect(await screen.findByRole("img", { name: "Pratinjau gambar produk" })).toHaveAttribute("src", IMAGE.url);

    await userEvent.click(screen.getByRole("button", { name: "Hapus gambar" }));
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(screen.queryByRole("img", { name: "Pratinjau gambar produk" })).toBeNull();
    await waitFor(() => expect(saved(calls)).toBeDefined());
    expect(saved(calls)!.image_key).toBeNull();
  });

  it("refuses a file over 2 MB before uploading it", async () => {
    const { calls } = server();
    await screen.findByRole("option", { name: "Minuman", hidden: true });

    await userEvent.upload(screen.getByLabelText("Gambar produk"), jpeg(2 * 1024 * 1024 + 1));

    expect(await screen.findByText("Ukuran gambar maksimal 2 MB")).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/v1/media/images")).toBe(false);
  });

  it("explains when the server rejects the image", async () => {
    server(undefined, () => ({ status: 422, body: { message: "bad", code: "UNSUPPORTED_IMAGE" } }));
    await screen.findByRole("option", { name: "Minuman", hidden: true });

    await userEvent.upload(screen.getByLabelText("Gambar produk"), jpeg());

    expect(await screen.findByText("Gambar harus JPG, PNG, atau WebP")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Pratinjau gambar produk" })).toBeNull();
  });
});
