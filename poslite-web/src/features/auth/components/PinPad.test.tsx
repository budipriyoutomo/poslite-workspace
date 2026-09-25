import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PinPad } from "./PinPad";

async function press(...keys: string[]) {
  for (const key of keys) await userEvent.click(screen.getByRole("button", { name: key }));
}

describe("PinPad", () => {
  it("submits the PIN once four digits are entered", async () => {
    const onComplete = vi.fn();
    render(<PinPad onComplete={onComplete} />);
    await press("1", "2", "3", "4");
    expect(onComplete).toHaveBeenCalledWith("1234");
  });

  it("shows how many digits are entered without revealing them", async () => {
    render(<PinPad onComplete={vi.fn()} />);
    await press("7", "7");
    expect(screen.getByRole("status", { name: "2 dari 4 digit" })).toBeInTheDocument();
    expect(screen.queryByText("77")).not.toBeInTheDocument();
  });

  it("deletes the last digit", async () => {
    const onComplete = vi.fn();
    render(<PinPad onComplete={onComplete} />);
    await press("1", "2", "Hapus", "3", "4", "5");
    expect(onComplete).toHaveBeenCalledWith("1345");
  });

  it("ignores input while disabled", async () => {
    const onComplete = vi.fn();
    render(<PinPad onComplete={onComplete} disabled />);
    await press("1", "2", "3", "4");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows an error message", () => {
    render(<PinPad onComplete={vi.fn()} error="PIN salah" />);
    expect(screen.getByRole("alert")).toHaveTextContent("PIN salah");
  });
});
