import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VoidDialog } from "./VoidDialog";

describe("VoidDialog (ADR-023)", () => {
  it("needs a reason, warns about non-cash payments and voids with a free-text reason", async () => {
    const onConfirm = vi.fn(async () => {});
    render(
      <VoidDialog receiptNo="JKT01A-260925-0001" hasNonCash actorIsManager approvers={[]} verifyApprover={async () => false} onConfirm={onConfirm} onClose={() => {}} />,
    );
    expect(screen.getByText(/harus dibatalkan manual/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Void transaksi" })).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("Alasan"), "Lainnya");
    await userEvent.type(screen.getByLabelText("Alasan lain"), "Tamu alergi");
    await userEvent.click(screen.getByRole("button", { name: "Void transaksi" }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ reason: "Tamu alergi", approvedBy: null }));
  });
});
