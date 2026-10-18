import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CartBar } from "./cart-bar";

describe("CartBar", () => {
  it("stays hidden while the order is empty", () => {
    const { container } = render(<CartBar itemCount={0} total={0} onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the order showing its item count and total", async () => {
    const onOpen = vi.fn();
    render(<CartBar itemCount={3} total={46_200} onOpen={onOpen} />);
    const bar = screen.getByRole("button", { name: /Lihat pesanan/ });
    expect(bar).toHaveTextContent("3 item");
    expect(bar).toHaveTextContent("Rp 46.200");
    await userEvent.click(bar);
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
