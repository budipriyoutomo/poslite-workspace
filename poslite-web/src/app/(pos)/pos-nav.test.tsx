import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PosNav } from "./pos-nav";

describe("PosNav", () => {
  it("links every POS screen", () => {
    render(<PosNav pathname="/sell" />);
    const nav = screen.getByRole("navigation", { name: "Menu utama" });
    expect(within(nav).getByRole("link", { name: "Jual" })).toHaveAttribute("href", "/sell");
    expect(within(nav).getByRole("link", { name: "Printer" })).toHaveAttribute("href", "/printer");
  });

  it("marks the current screen", () => {
    render(<PosNav pathname="/orders" />);
    expect(screen.getByRole("link", { name: "Riwayat" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Jual" })).not.toHaveAttribute("aria-current");
  });

  it("opens the secondary screens from Lainnya", async () => {
    render(<PosNav pathname="/sell" />);
    await userEvent.click(screen.getByRole("button", { name: "Lainnya" }));
    const sheet = screen.getByRole("dialog", { name: "Menu lainnya" });
    expect(within(sheet).getByRole("link", { name: "Laporan" })).toHaveAttribute("href", "/reports");
    expect(within(sheet).getByRole("link", { name: "Sync" })).toHaveAttribute("href", "/sync");
    expect(within(sheet).getByRole("link", { name: "Printer" })).toHaveAttribute("href", "/printer");
  });

  it("marks Lainnya while a secondary screen is open", () => {
    render(<PosNav pathname="/reports" />);
    expect(screen.getByRole("button", { name: "Lainnya" })).toHaveAttribute("aria-current", "page");
  });
});
