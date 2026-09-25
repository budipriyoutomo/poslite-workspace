import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { MoneyKeypad } from "./money-keypad";

function Harness({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial);
  return <MoneyKeypad label="Modal awal" value={value} onChange={setValue} />;
}

const press = async (...keys: string[]) => {
  for (const key of keys) await userEvent.click(screen.getByRole("button", { name: key }));
};

describe("MoneyKeypad", () => {
  it("shows the amount formatted in Rupiah", () => {
    render(<Harness initial={12_500} />);
    expect(screen.getByRole("status", { name: "Modal awal" })).toHaveTextContent("Rp 12.500");
  });

  it("builds an amount from digits and the 000 shortcut", async () => {
    render(<Harness />);
    await press("5", "0", "000");
    expect(screen.getByRole("status", { name: "Modal awal" })).toHaveTextContent("Rp 50.000");
  });

  it("deletes the last digit and clears", async () => {
    render(<Harness initial={12_345} />);
    await press("Hapus digit");
    expect(screen.getByRole("status", { name: "Modal awal" })).toHaveTextContent("Rp 1.234");
    await press("C");
    expect(screen.getByRole("status", { name: "Modal awal" })).toHaveTextContent("Rp 0");
  });
});
