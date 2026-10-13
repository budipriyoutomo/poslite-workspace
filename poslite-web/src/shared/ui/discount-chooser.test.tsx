import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DiscountChooser, hasDiscountChoices } from "./discount-chooser";

describe("DiscountChooser (brand discount policy)", () => {
  it("offers the brand's presets", async () => {
    const onChoose = vi.fn();
    render(<DiscountChooser percentages={[5, 12]} amounts={[3_000]} allowCustom={false} onChoose={onChoose} />);

    await userEvent.click(screen.getByRole("button", { name: "12%" }));
    await userEvent.click(screen.getByRole("button", { name: "Rp 3.000" }));

    expect(onChoose.mock.calls).toEqual([[{ type: "percentage", value: 12 }], [{ type: "fixed", value: 3_000 }]]);
    expect(screen.queryByLabelText("Diskon lain")).not.toBeInTheDocument();
  });

  it("takes a typed percentage or Rupiah value when the brand allows it", async () => {
    const onChoose = vi.fn();
    render(<DiscountChooser percentages={[]} amounts={[]} allowCustom onChoose={onChoose} />);

    await userEvent.type(screen.getByLabelText("Diskon lain"), "7");
    await userEvent.click(screen.getByRole("button", { name: "Pakai %" }));
    await userEvent.clear(screen.getByLabelText("Diskon lain"));
    await userEvent.type(screen.getByLabelText("Diskon lain"), "7500");
    await userEvent.click(screen.getByRole("button", { name: "Pakai Rp" }));

    expect(onChoose.mock.calls).toEqual([[{ type: "percentage", value: 7 }], [{ type: "fixed", value: 7_500 }]]);
  });

  it("never takes a percentage above 100", async () => {
    render(<DiscountChooser percentages={[]} amounts={[]} allowCustom onChoose={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Diskon lain"), "150");

    expect(screen.getByRole("button", { name: "Pakai %" })).toBeDisabled();
  });

  it("tells a cashier which presets are over the brand limit and need a manager's PIN", () => {
    render(<DiscountChooser percentages={[10, 15]} amounts={[5_000, 25_000]} allowCustom={false} cashierLimit={{ maxPercentage: 10, maxAmount: 20_000 }} onChoose={vi.fn()} />);

    expect(screen.getByText("Di atas 10% atau Rp 20.000 per transaksi butuh PIN manajer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^15%/ })).toHaveTextContent("PIN");
    expect(screen.getByRole("button", { name: /^Rp 25\.000/ })).toHaveTextContent("PIN");
    expect(screen.getByRole("button", { name: /^10%/ })).not.toHaveTextContent("PIN");
    expect(screen.getByRole("button", { name: /^Rp 5\.000/ })).not.toHaveTextContent("PIN");
  });

  it("has nothing to offer when the brand has no presets and no typed value", () => {
    expect(hasDiscountChoices({ percentages: [], amounts: [], allowCustom: false })).toBe(false);
    expect(hasDiscountChoices({ percentages: [], amounts: [5_000], allowCustom: false })).toBe(true);
    expect(hasDiscountChoices({ percentages: [], amounts: [], allowCustom: true })).toBe(true);
  });
});
