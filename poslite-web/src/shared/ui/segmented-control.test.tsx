import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SegmentedControl } from "./segmented-control";

const options = ["Dine In", "Take Away", "GoFood", "GrabFood", "ShopeeFood"].map((label) => ({ value: label, label }));

function setup(value: string, maxVisible?: number) {
  const onChange = vi.fn();
  render(<SegmentedControl label="Jenis pesanan" options={options} value={value} onChange={onChange} maxVisible={maxVisible} />);
  return onChange;
}

describe("SegmentedControl (15 §4)", () => {
  it("marks the active choice", () => {
    setup("Take Away");
    expect(screen.getByRole("button", { name: "Take Away" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dine In" })).toHaveAttribute("aria-pressed", "false");
  });

  it("puts what does not fit behind Lainnya", async () => {
    const onChange = setup("Dine In", 3);
    expect(screen.queryByRole("button", { name: "GrabFood" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Lainnya" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "ShopeeFood" }));

    expect(onChange).toHaveBeenCalledWith("ShopeeFood");
  });

  it("keeps the active choice in view even when it comes from Lainnya", () => {
    setup("ShopeeFood", 3);
    expect(screen.getByRole("button", { name: "ShopeeFood" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { pressed: false }).map((b) => b.textContent)).toEqual(["Dine In", "Take Away", "Lainnya"]);
  });
});
