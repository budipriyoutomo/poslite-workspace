import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { CloseShiftDialog } from "./CloseShiftDialog";

function setup(props: Partial<ComponentProps<typeof CloseShiftDialog>>) {
  const onConfirm = vi.fn(async () => {});
  render(<CloseShiftDialog open expectedCash={252_765} isBlind canSeeExpected={false} onConfirm={onConfirm} onClose={() => {}} {...props} />);
  return { onConfirm };
}

describe("CloseShiftDialog (15 · UX-02)", () => {
  it("lets a cashier count blind: no expected cash, no variance", async () => {
    setup({});
    expect(screen.getByLabelText("Lembar Rp 100.000")).toBeInTheDocument();
    expect(screen.queryByText(/Seharusnya/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Selisih/)).not.toBeInTheDocument();
    expect(screen.queryByText(/252\.765/)).not.toBeInTheDocument();
  });

  it("closes with the count per denomination", async () => {
    const { onConfirm } = setup({});
    await userEvent.type(screen.getByLabelText("Lembar Rp 100.000"), "2");
    await userEvent.type(screen.getByLabelText("Lembar Rp 50.000"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Tutup Shift" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ denominations: { 100_000: 2, 50_000: 1 } }));
  });

  it("shows a manager the expected cash and the variance while counting blind", async () => {
    setup({ canSeeExpected: true });
    await userEvent.type(screen.getByLabelText("Lembar Rp 100.000"), "2");

    expect(screen.getByText("Rp 252.765")).toBeInTheDocument();
    expect(screen.getByText("-Rp 52.765")).toBeInTheDocument();
  });

  it("keeps the single total with expected cash and variance when the brand turned blind close off", () => {
    setup({ isBlind: false, canSeeExpected: true });
    expect(screen.queryByLabelText("Lembar Rp 100.000")).not.toBeInTheDocument();
    expect(screen.getByText("Seharusnya di laci")).toBeInTheDocument();
  });
});
