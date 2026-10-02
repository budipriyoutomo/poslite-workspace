import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ProductRow } from "@/shared/db";

import type { Catalog } from "../application/use-catalog";
import { ProductGrid } from "./ProductGrid";

const product = (id: string, name: string, imageKey: string | null): ProductRow => ({ id, categoryId: "C1", sku: id, name, price: 5_000, imageKey, isAvailable: true, modifierGroupIds: [] });

const catalog = (mediaBaseUrl: string | null): Catalog => ({
  categories: [],
  products: [product("P1", "Es Teh", "T1/products/P1.jpg"), product("P2", "Kopi", null)],
  groupsById: new Map(),
  categoryNameById: new Map(),
  mediaBaseUrl,
});

describe("ProductGrid", () => {
  it("shows product photos from the server's current media base URL", () => {
    render(<ProductGrid catalog={catalog("https://is3.cloudhost.id/poslite")} onSelect={vi.fn()} />);

    // Photos are decorative (alt=""): the product name is the button's label.
    const photo = (name: string) => screen.getByRole("button", { name: new RegExp(name) }).querySelector("img");
    expect(photo("Es Teh")).toHaveAttribute("src", "https://is3.cloudhost.id/poslite/T1/products/P1.jpg");
    expect(photo("Kopi")).toBeNull();
  });
});
