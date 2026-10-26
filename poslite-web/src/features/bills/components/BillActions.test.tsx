import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BillActions } from "./BillActions";

function setup(props: Partial<Parameters<typeof BillActions>[0]> = {}) {
  const on = { onSend: vi.fn(), onCancel: vi.fn() };
  render(<BillActions newCount={2} isSaved={false} canPay total={57_750} isEmpty={false} {...on} {...props} />);
  return on;
}

describe("BillActions (15 · UX-06)", () => {
  it("makes sending the new items to the kitchen the main action, paying second", async () => {
    const on = setup();
    const send = screen.getByRole("button", { name: "Kirim ke dapur (2 baru)" });
    expect(send).toHaveAttribute("data-variant", "default");
    expect(screen.getByRole("link", { name: "Bayar · Rp 57.750" })).toHaveAttribute("data-variant", "outline");
    await userEvent.click(send);
    expect(on.onSend).toHaveBeenCalled();
  });

  it("saves the bill when nothing new is waiting for the kitchen", () => {
    setup({ newCount: 0, isSaved: true });
    expect(screen.getByRole("button", { name: "Simpan bill" })).toBeInTheDocument();
  });

  it("offers cancelling a saved bill as a small link", async () => {
    const on = setup({ isSaved: true });
    await userEvent.click(screen.getByRole("button", { name: "Batalkan bill" }));
    expect(on.onCancel).toHaveBeenCalled();
  });

  it("has nothing to cancel on a bill not saved yet", () => {
    setup({ isSaved: false });
    expect(screen.queryByRole("button", { name: "Batalkan bill" })).not.toBeInTheDocument();
  });

  it("never offers a waiter the payment (ADR-031)", () => {
    setup({ canPay: false });
    expect(screen.queryByRole("link", { name: /Bayar/ })).not.toBeInTheDocument();
  });
});
