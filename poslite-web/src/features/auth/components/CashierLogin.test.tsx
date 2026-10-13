import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { UserRow } from "@/shared/db";
import { AppError } from "@/shared/errors";

import { CashierLogin } from "./CashierLogin";

const cashier = (id: string, name: string): UserRow => ({ id, name, role: "cashier", pinHash: "", pinSalt: "", pinIterations: 1 });
const SITI = cashier("s", "Siti");
const BUDI = cashier("b", "Budi");

async function press(...keys: string[]) {
  for (const key of keys) await userEvent.click(screen.getByRole("button", { name: key }));
}

describe("CashierLogin", () => {
  it("opens on the last cashier so they only type their PIN", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<CashierLogin users={[SITI, BUDI]} lastUserId="s" onLogin={onLogin} />);

    expect(screen.getByText("Halo Siti, masukkan PIN")).toBeInTheDocument();
    await press("1", "2", "3", "4");
    expect(onLogin).toHaveBeenCalledWith(SITI, "1234");
  });

  it("lets another cashier pick their name", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<CashierLogin users={[SITI, BUDI]} lastUserId="s" onLogin={onLogin} />);

    await userEvent.click(screen.getByRole("button", { name: "Ganti kasir" }));
    await userEvent.click(screen.getByRole("button", { name: /Budi/ }));
    await press("9", "9", "9", "9");

    expect(onLogin).toHaveBeenCalledWith(BUDI, "9999");
  });

  it("lists the cashiers in the given order on a device nobody has logged in to", () => {
    render(<CashierLogin users={[SITI, BUDI]} onLogin={vi.fn()} />);

    expect(screen.getByText("Pilih nama Anda")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([expect.stringContaining("Siti"), expect.stringContaining("Budi")]);
  });

  it("explains a wrong PIN", async () => {
    render(<CashierLogin users={[SITI]} lastUserId="s" onLogin={vi.fn().mockRejectedValue(new AppError("WRONG_PIN"))} />);

    await press("0", "0", "0", "0");

    expect(await screen.findByText("PIN salah")).toBeInTheDocument();
  });
});
