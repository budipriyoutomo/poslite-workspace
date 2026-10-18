import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./theme-toggle";

const renderToggle = () =>
  render(
    <ThemeProvider attribute="class" defaultTheme="light">
      <ThemeToggle />
    </ThemeProvider>,
  );

// jsdom has no matchMedia; next-themes reads it to follow the system theme.
beforeAll(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.className = "";
});

describe("ThemeToggle", () => {
  it("switches from light to dark", async () => {
    renderToggle();
    await userEvent.click(screen.getByRole("button", { name: "Mode gelap" }));
    expect(document.documentElement).toHaveClass("dark");
  });

  it("switches back to light", async () => {
    renderToggle();
    await userEvent.click(screen.getByRole("button", { name: "Mode gelap" }));
    await userEvent.click(screen.getByRole("button", { name: "Mode terang" }));
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
