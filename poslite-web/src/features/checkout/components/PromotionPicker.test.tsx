import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PromotionPicker } from "./PromotionPicker";

const HAPPY = { promotion: { id: "PR1", name: "Happy hour" }, amount: 3_600 };
const NASI = { promotion: { id: "PR2", name: "Nasi hemat" }, amount: 3_000 };

describe("PromotionPicker", () => {
  it("offers each running promotion with its saving, none applied until chosen", () => {
    render(<PromotionPicker available={[HAPPY, NASI]} chosenIds={[]} onToggle={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Happy hour.*Rp 3\.600/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /Nasi hemat.*Rp 3\.000/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("applies or removes a promotion when the cashier taps it", async () => {
    const onToggle = vi.fn();
    render(<PromotionPicker available={[HAPPY]} chosenIds={["PR1"]} onToggle={onToggle} />);

    const happy = screen.getByRole("button", { name: /Happy hour/ });
    expect(happy).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(happy);

    expect(onToggle).toHaveBeenCalledWith("PR1");
  });

  it("shows nothing when no promotion runs for these items", () => {
    const { container } = render(<PromotionPicker available={[]} chosenIds={[]} onToggle={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });
});
