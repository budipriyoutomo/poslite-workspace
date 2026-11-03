import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ActiveTableBar, KitchenSendBar } from "./PhoneBillBars";

describe("ActiveTableBar (15 · UX-09)", () => {
  it("keeps the table on top of the waiter's phone, with a way to change it", async () => {
    const onChange = vi.fn();
    render(<ActiveTableBar tableLabel="A3" canChange onChange={onChange} />);

    expect(screen.getByRole("status", { name: "Meja aktif" })).toHaveTextContent("Meja A3");
    await userEvent.click(screen.getByRole("button", { name: "Ganti meja" }));
    expect(onChange).toHaveBeenCalled();
  });

  it("locks the table of a saved bill, which moves on the table screen", () => {
    render(<ActiveTableBar tableLabel="A3" canChange={false} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Ganti meja" })).toBeDisabled();
  });
});

describe("KitchenSendBar (15 · UX-09)", () => {
  const props = { newCount: 2, itemCount: 5, subtotal: 46_200, onSend: vi.fn(), onOpen: vi.fn() };

  it("sends the new items to the kitchen from the bottom of the phone", async () => {
    const onSend = vi.fn();
    render(<KitchenSendBar {...props} onSend={onSend} />);

    await userEvent.click(screen.getByRole("button", { name: /Kirim ke dapur \(2 baru\)/ }));
    expect(onSend).toHaveBeenCalled();
  });

  it("shows the subtotal and opens the order from the summary", async () => {
    const onOpen = vi.fn();
    render(<KitchenSendBar {...props} onOpen={onOpen} />);

    await userEvent.click(screen.getByRole("button", { name: "Lihat pesanan · 5 item · Rp 46.200" }));
    expect(onOpen).toHaveBeenCalled();
  });

  it("cannot send twice while the bill is saving", () => {
    render(<KitchenSendBar {...props} isBusy />);
    expect(screen.getByRole("button", { name: /Kirim ke dapur/ })).toBeDisabled();
  });
});
