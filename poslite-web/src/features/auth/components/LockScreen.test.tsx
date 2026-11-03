import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, type OutletSetting } from "@/shared/db";

import { LockScreen } from "./LockScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const OUTLET: OutletSetting = {
  outletId: "O",
  outletCode: "BDG01",
  outletName: "Outlet Dago",
  deviceId: "D",
  deviceCode: "A",
  timezone: "Asia/Jakarta",
  businessDayCutoff: "04:00",
  serviceBps: 0,
  taxBps: 0,
  receiptHeader: "",
  receiptFooter: "",
  brand: { id: "B", code: "SM", name: "Sushi Maru", logoKey: null },
};

const asDevice = (mode: "server" | "demo") =>
  getDb().syncState.put({ key: "device", value: mode === "demo" ? { mode } : { mode, deviceId: "D", deviceCode: "A", outletId: "O", token: "t" } });

beforeEach(async () => {
  const db = getDb();
  await Promise.all([db.syncState.clear(), db.settings.clear(), db.users.clear()]);
  await db.settings.put({ key: "outlet", value: OUTLET });
});

describe("LockScreen (15 · UX-11)", () => {
  it("names the brand and the outlet before anyone logs in", async () => {
    await asDevice("server");
    render(<LockScreen />);
    expect(await screen.findByRole("heading", { name: "Sushi Maru" })).toBeInTheDocument();
    expect(await screen.findByText("Outlet Dago")).toBeInTheDocument();
  });

  it("shows the POSLite logo when the brand has none", async () => {
    await asDevice("server");
    render(<LockScreen />);
    expect(await screen.findByRole("img", { name: "POSLite" })).toBeInTheDocument();
  });

  it("shows the demo PINs together with the demo banner", async () => {
    await asDevice("demo");
    render(<LockScreen />);
    expect(await screen.findByRole("alert")).toHaveTextContent("MODE DEMO");
    expect(screen.getByText("Demo: Siti 1234 · Budi 9999")).toBeInTheDocument();
  });

  it("shows neither on an activated device", async () => {
    await asDevice("server");
    render(<LockScreen />);
    await screen.findByText("Outlet Dago");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Demo:/)).not.toBeInTheDocument();
  });
});
