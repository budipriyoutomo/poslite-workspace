import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, type OutletSetting } from "@/shared/db";

import { PosHeader } from "./pos-header";

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

const renderHeader = (isOnline: boolean, onLock = vi.fn()) => render(<PosHeader cashierName="Siti" isOnline={isOnline} onLock={onLock} />);

beforeEach(async () => {
  const db = getDb();
  await Promise.all([db.syncState.clear(), db.settings.clear(), db.outbox.clear()]);
});

describe("PosHeader", () => {
  it("warns the cashier while offline", () => {
    renderHeader(false);
    expect(screen.getByRole("status")).toHaveTextContent("tersimpan di perangkat");
  });

  it("shows no offline banner while online", () => {
    renderHeader(true);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the sync state instead of a bare Online label (15 · UX-01)", async () => {
    await getDb().syncState.put({ key: "device", value: { mode: "server", deviceId: "D", deviceCode: "A", outletId: "O", token: "t" } });
    renderHeader(true);
    expect(await screen.findByRole("button", { name: /Tersinkron/ })).toBeInTheDocument();
    expect(screen.queryByText("Online", { exact: true })).not.toBeInTheDocument();
  });

  it("shows the demo banner and a DEMO badge on a demo device", async () => {
    await getDb().syncState.put({ key: "device", value: { mode: "demo" } });
    renderHeader(true);
    expect(await screen.findByRole("alert")).toHaveTextContent("MODE DEMO");
    expect(await screen.findByText("DEMO")).toBeInTheDocument();
  });

  it("names the brand, outlet and device under the logo", async () => {
    await getDb().settings.put({ key: "outlet", value: OUTLET });
    renderHeader(true);
    expect(await screen.findByText("Sushi Maru · Outlet Dago · Perangkat A")).toBeInTheDocument();
  });

  it("locks the POS", async () => {
    const onLock = vi.fn();
    renderHeader(true, onLock);
    await userEvent.click(screen.getByRole("button", { name: "Kunci" }));
    expect(onLock).toHaveBeenCalledOnce();
  });
});
