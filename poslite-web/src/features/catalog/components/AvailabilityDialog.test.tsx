import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AvailabilityDialog } from "./AvailabilityDialog";

describe("AvailabilityDialog (P1-2)", () => {
  it("marks an available item sold out until tomorrow by default", async () => {
    const onChoose = vi.fn();
    render(<AvailabilityDialog productName="Es Teh" isAvailable onChoose={onChoose} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Habis sampai besok" }));

    expect(onChoose).toHaveBeenCalledWith({ isAvailable: false, untilEndOfDay: true });
  });

  it("can keep it sold out until switched back on", async () => {
    const onChoose = vi.fn();
    render(<AvailabilityDialog productName="Es Teh" isAvailable onChoose={onChoose} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Habis sampai diaktifkan lagi" }));

    expect(onChoose).toHaveBeenCalledWith({ isAvailable: false, untilEndOfDay: false });
  });

  it("switches a sold-out item back on", async () => {
    const onChoose = vi.fn();
    render(<AvailabilityDialog productName="Es Teh" isAvailable={false} onChoose={onChoose} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Tersedia lagi" }));

    expect(onChoose).toHaveBeenCalledWith({ isAvailable: true, untilEndOfDay: false });
  });
});
