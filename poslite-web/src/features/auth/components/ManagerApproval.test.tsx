import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureDemoData, getDb } from "@/shared/db";

import { ManagerApproval } from "./ManagerApproval";

// Demo users: Budi is a manager (PIN 9999), Siti a cashier.
beforeEach(async () => {
  const db = getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureDemoData(db);
});

describe("ManagerApproval (15 · UX-05)", () => {
  it("lists only managers and owners of this device", async () => {
    render(<ManagerApproval approvedBy={null} onApproved={vi.fn()} />);
    expect(await screen.findByRole("option", { name: "Budi" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Siti" })).not.toBeInTheDocument();
  });

  it("approves with the manager's PIN", async () => {
    const onApproved = vi.fn();
    render(<ManagerApproval approvedBy={null} onApproved={onApproved} />);
    await screen.findByRole("option", { name: "Budi" });
    await userEvent.type(screen.getByLabelText("PIN manajer"), "9999");
    await userEvent.click(screen.getByRole("button", { name: "Setujui" }));
    const budi = (await getDb().users.toArray()).find((u) => u.name === "Budi");
    // Demo PINs use the production PBKDF2 cost (310k iterations): slow in jsdom.
    await vi.waitFor(() => expect(onApproved).toHaveBeenCalledWith(budi?.id), { timeout: 10_000 });
  });

  it("shows the device lockout instead of a plain wrong PIN", async () => {
    await getDb().syncState.put({ key: "pinLockout", value: { failures: 5, lockedUntil: new Date(Date.now() + 60_000).toISOString() } });
    render(<ManagerApproval approvedBy={null} onApproved={vi.fn()} />);
    await screen.findByRole("option", { name: "Budi" });
    await userEvent.type(screen.getByLabelText("PIN manajer"), "9999");
    await userEvent.click(screen.getByRole("button", { name: "Setujui" }));
    expect(await screen.findByText(/^Terlalu banyak PIN salah/)).toBeInTheDocument();
  });
});
