import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { OrderReview } from "./OrderReview";

describe("OrderReview", () => {
  it("summarises the order while its details are folded", () => {
    render(
      <OrderReview itemCount={3} total={46_200}>
        <p>Es Teh</p>
      </OrderReview>,
    );
    const toggle = screen.getByRole("button", { name: /Rincian pesanan/ });
    expect(toggle).toHaveTextContent("3 item · Rp 46.200");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("unfolds the details on tap", async () => {
    render(
      <OrderReview itemCount={3} total={46_200}>
        <p>Es Teh</p>
      </OrderReview>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Rincian pesanan/ }));
    expect(screen.getByRole("button", { name: /Rincian pesanan/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("stays unfolded while the cashier picks items to split", () => {
    render(
      <OrderReview itemCount={3} total={46_200} forceOpen>
        <p>Es Teh</p>
      </OrderReview>,
    );
    expect(screen.getByRole("button", { name: /Rincian pesanan/ })).toHaveAttribute("aria-expanded", "true");
  });
});
