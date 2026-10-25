import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApprovalField } from "./approval-field";

const approvers = [{ id: "M1", name: "Bu Rina" }];

async function approveWith(verify: (id: string, pin: string) => Promise<boolean | string>, onApproved = vi.fn()) {
  render(<ApprovalField approvers={approvers} verifyApprover={verify} approvedBy={null} onApproved={onApproved} />);
  await userEvent.type(screen.getByLabelText("PIN manajer"), "2468");
  await userEvent.click(screen.getByRole("button", { name: "Setujui" }));
  return onApproved;
}

describe("ApprovalField", () => {
  it("approves when the PIN checks out", async () => {
    const onApproved = await approveWith(async () => true);
    expect(onApproved).toHaveBeenCalledWith("M1");
  });

  it("says the PIN is wrong when the check fails", async () => {
    await approveWith(async () => false);
    expect(screen.getByText("PIN salah")).toBeInTheDocument();
  });

  it("shows the checker's own message, such as the lockout (15 · UX-05)", async () => {
    const onApproved = await approveWith(async () => "Terlalu banyak PIN salah. Coba lagi pukul 10.05");
    expect(screen.getByText("Terlalu banyak PIN salah. Coba lagi pukul 10.05")).toBeInTheDocument();
    expect(onApproved).not.toHaveBeenCalled();
  });
});
