import { act, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "./sonner";

function matchWidth(isWide: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: isWide, media: query, addEventListener: () => {}, removeEventListener: () => {} }));
}

async function showToast() {
  render(<Toaster />);
  act(() => void toast.success("Bill meja A1 disimpan"));
  await screen.findByText("Bill meja A1 disimpan");
  return document.querySelector("[data-sonner-toaster]");
}

afterEach(() => {
  vi.unstubAllGlobals();
  toast.dismiss();
});

describe("Toaster position (15 · UX-07)", () => {
  it("shows toasts at the bottom of a tablet, clear of the screen's main button", async () => {
    matchWidth(true);
    const toaster = await showToast();
    expect(toaster).toHaveAttribute("data-y-position", "bottom");
    expect(toaster).toHaveStyle({ "--offset-bottom": "120px" });
  });

  it("keeps toasts at the top of a phone, where the bottom holds the navigation", async () => {
    matchWidth(false);
    const toaster = await showToast();
    expect(toaster).toHaveAttribute("data-y-position", "top");
  });
});
