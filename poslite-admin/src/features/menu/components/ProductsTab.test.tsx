import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { ProductsTab } from "./ProductsTab";

const URL = "https://is3.cloudhost.id/poslite/T/products/P1.jpg";
const product = (id: string, name: string, image: string | null) => ({
  id,
  category_id: "01K5ZC00000000000000000001",
  sku: id,
  name,
  price: 5000,
  image_key: image && "T/products/P1.jpg",
  image_url: image,
  is_available: true,
  modifier_group_ids: [],
});

describe("ProductsTab", () => {
  it("shows each product's image as a thumbnail", async () => {
    renderWithApi(<ProductsTab />, ({ path }) => {
      if (path === "/api/v1/categories") return envelope([{ id: "01K5ZC00000000000000000001", name: "Minuman", sort_order: 0, color: "", print_role: "bar" }]);
      if (path === "/api/v1/products") return envelope([product("P1", "Es Teh", URL), product("P2", "Kopi", null)]);
      return undefined;
    });

    const teh = (await screen.findByText("Es Teh")).closest("tr")!;
    expect(within(teh).getByRole("img", { name: "Gambar Es Teh" })).toHaveAttribute("src", URL);
    expect(within(screen.getByText("Kopi").closest("tr")!).queryByRole("img")).toBeNull();
  });
});
