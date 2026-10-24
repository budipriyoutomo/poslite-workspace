import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChannelPicker } from "./ChannelPicker";

const channels = [
  { id: "DI", name: "Dine In", kind: "dine_in" as const },
  { id: "TA", name: "Take Away", kind: "take_away" as const },
  { id: "GO", name: "GoFood", kind: "delivery" as const },
];

describe("ChannelPicker (ADR-029)", () => {
  it("offers the take-away and delivery channels, marking the active one", () => {
    render(<ChannelPicker channels={channels} activeId="TA" onChoose={vi.fn()} />);

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Take Away", "GoFood"]);
    expect(screen.getByRole("button", { name: "Take Away" })).toHaveAttribute("aria-pressed", "true");
  });

  it("moves the sale to the channel the cashier taps", async () => {
    const onChoose = vi.fn();
    render(<ChannelPicker channels={channels} activeId="TA" onChoose={onChoose} />);

    await userEvent.click(screen.getByRole("button", { name: "GoFood" }));

    expect(onChoose).toHaveBeenCalledWith(channels[2]);
  });

  it("shows nothing when there is only one way to sell over the counter", () => {
    const { container } = render(<ChannelPicker channels={channels.slice(0, 2)} activeId="TA" onChoose={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
