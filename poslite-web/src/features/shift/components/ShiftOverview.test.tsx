import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/features/auth";
import { ensureDemoData, getDb, type ShiftRow, type UserRow } from "@/shared/db";
import { toast } from "@/shared/ui/toast";

import { openShift } from "../application/shift";
import { ShiftOverview } from "./ShiftOverview";

vi.mock("@/shared/ui/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

let shift: ShiftRow;
let users: Record<string, UserRow>;

async function setBlindClose(blindClose: boolean) {
  const db = getDb();
  const outlet = (await db.settings.get("outlet"))!.value;
  await db.settings.put({ key: "outlet", value: { ...outlet, blindClose } });
}

function renderAs(name: "Siti" | "Budi") {
  const u = users[name]!;
  useSession.setState({ user: { id: u.id, name: u.name, role: u.role } });
  render(<ShiftOverview shift={shift} />);
}

// Demo data: Siti is a cashier, Budi a manager (PIN 9999). The demo brand counts blind (default).
beforeEach(async () => {
  vi.clearAllMocks();
  const db = getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
  await ensureDemoData(db);
  users = Object.fromEntries((await db.users.toArray()).map((u) => [u.name, u]));
  shift = await openShift({ cashierId: users.Siti!.id, openingCash: 200_000 });
});

describe("ShiftOverview (15 · UX-02)", () => {
  it("never shows a cashier the expected cash, nor the cash sales and change it is made from", async () => {
    renderAs("Siti");
    expect(await screen.findByText("Modal awal")).toBeInTheDocument();
    expect(screen.getByText("Transaksi")).toBeInTheDocument();
    expect(screen.queryByText("Seharusnya di laci")).not.toBeInTheDocument();
    expect(screen.queryByText("Penjualan tunai")).not.toBeInTheDocument();
    expect(screen.queryByText("Kembalian")).not.toBeInTheDocument();
  });

  it("shows a manager the expected cash", async () => {
    renderAs("Budi");
    expect(await screen.findByText("Seharusnya di laci")).toBeInTheDocument();
  });

  it("shows the cashier the expected cash once a manager approves", async () => {
    renderAs("Siti");
    await userEvent.click(await screen.findByRole("button", { name: "Lihat kas seharusnya" }));
    await userEvent.type(await screen.findByLabelText("PIN manajer"), "9999");
    await userEvent.click(screen.getByRole("button", { name: "Setujui" }));

    // Demo PINs use the production PBKDF2 cost: slow in jsdom.
    expect(await screen.findByText("Seharusnya di laci", {}, { timeout: 10_000 })).toBeInTheDocument();
  });

  it("shows a cashier the expected cash when the brand turned blind close off", async () => {
    await setBlindClose(false);
    renderAs("Siti");
    expect(await screen.findByText("Seharusnya di laci")).toBeInTheDocument();
  });

  it("closes the shift with a toast that carries no amount", async () => {
    renderAs("Siti");
    await userEvent.click(await screen.findByRole("button", { name: "Tutup Shift" }));
    await userEvent.type(screen.getByLabelText("Lembar Rp 100.000"), "2");
    await userEvent.click(screen.getAllByRole("button", { name: "Tutup Shift" }).at(-1)!);

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Shift ditutup"));
    expect((await getDb().shifts.get(shift.id))?.status).toBe("closed");
  });
});
