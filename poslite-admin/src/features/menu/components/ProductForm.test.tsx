import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { ProductForm } from "./ProductForm";

const CATEGORIES = [{ id: "01K5ZC00000000000000000001", name: "Minuman", sort_order: 1, color: "", print_role: "bar" }];
const GROUPS = [{ id: "01K5ZG00000000000000000001", name: "Level Gula", min_select: 1, max_select: 1, options: [] }];

function server() {
  return renderWithApi(<ProductForm onDone={vi.fn()} />, ({ method, path, body }) => {
    if (path === "/api/v1/categories") return envelope(CATEGORIES);
    if (path === "/api/v1/modifier-groups") return envelope(GROUPS);
    if (method === "POST" && path === "/api/v1/products") return { status: 201, ...envelope({ id: "P1", ...(body as object) }) };
    return undefined;
  });
}

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
      image_url: null,
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
});
