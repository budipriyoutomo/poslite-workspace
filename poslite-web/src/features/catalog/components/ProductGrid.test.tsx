import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("shows how many of a product are already in the order", () => {
    render(<ProductGrid catalog={catalog(null)} quantities={{ P1: 2 }} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Es Teh/ })).toHaveAccessibleName(/2 di pesanan/);
    expect(screen.getByRole("button", { name: /Kopi/ })).not.toHaveAccessibleName(/di pesanan/);
  });

  it("offers to clear a search that matches nothing", async () => {
    render(<ProductGrid catalog={catalog(null)} onSelect={vi.fn()} />);
    await userEvent.type(screen.getByRole("searchbox", { name: "Cari menu…" }), "zzz");
    expect(screen.getByText("Menu tidak ditemukan")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hapus pencarian" }));
    expect(screen.getByRole("button", { name: /Es Teh/ })).toBeInTheDocument();
  });

  it("explains an empty menu before the first sync", () => {
    render(<ProductGrid catalog={{ ...catalog(null), products: [] }} onSelect={vi.fn()} />);
    expect(screen.getByText("Belum ada menu")).toBeInTheDocument();
  });
});
