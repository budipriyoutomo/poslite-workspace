import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, readState } from "@/shared/db";

import { DemoBanner } from "./DemoBanner";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(async () => {
  replace.mockReset();
  await getDb().syncState.clear();
});

describe("DemoBanner (15 · UX-01)", () => {
  it("warns that a demo device sends nothing to the server", async () => {
    await getDb().syncState.put({ key: "device", value: { mode: "demo" } });
    render(<DemoBanner />);
    expect(await screen.findByRole("alert")).toHaveTextContent("MODE DEMO: transaksi TIDAK tersimpan ke server dan tidak masuk laporan owner");
  });

  it("shows nothing on an activated device", async () => {
    await getDb().syncState.put({ key: "device", value: { mode: "server", deviceId: "D", deviceCode: "A", outletId: "O", token: "t" } });
    render(<DemoBanner />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves the demo after confirmation and goes to activation", async () => {
    await getDb().syncState.put({ key: "device", value: { mode: "demo" } });
    render(<DemoBanner />);

    await userEvent.click(await screen.findByRole("button", { name: "Keluar dari demo" }));
    await userEvent.click(screen.getByRole("button", { name: "Ya, keluar" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/activate"));
    expect(await readState(getDb(), "device")).toBeUndefined();
  });
});
