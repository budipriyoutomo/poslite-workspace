import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { getDb, type OrderRow } from "@/shared/db";

import { OrdersScreen } from "./OrdersScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("id=01ORDER"),
}));

const order: OrderRow = {
  id: "01ORDER",
  shiftId: "01SHIFT",
  receiptNo: "A1-260101-0001",
  cashierId: "U1",
  cashierName: "Siti",
  businessDate: "2026-01-01",
  orderType: "take_away",
  lines: [],
  discount: null,
  rates: { serviceBps: 0, taxBps: 0 },
  subtotal: 5_000,
  discountAmount: 0,
  serviceCharge: 0,
  tax: 0,
  total: 5_000,
  paidAmount: 5_000,
  changeAmount: 0,
  status: "paid",
  syncStatus: "pending",
  flags: [],
  createdAt: "2026-01-01T10:00:00.000Z",
};

const onWideScreen = (isWide: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: isWide, media: query, addEventListener: () => {}, removeEventListener: () => {} }));

beforeAll(async () => {
  await getDb().orders.put(order);
});

describe("OrdersScreen", () => {
  it("opens the selected receipt in a sheet on a phone", async () => {
    onWideScreen(false);
    render(<OrdersScreen />);
    const sheet = await screen.findByRole("dialog", { name: "A1-260101-0001" });
    expect(sheet).toContainElement(screen.getByRole("button", { name: "Cetak Ulang" }));
  });

  it("shows the selected receipt beside the list on a tablet", async () => {
    onWideScreen(true);
    render(<OrdersScreen />);
    expect(await screen.findByRole("button", { name: "Cetak Ulang" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a take-away order's queue number and guest in the list (P1-1)", async () => {
    await getDb().orders.put({ ...order, id: "O-Q", receiptNo: "A1-260101-0002", queueNo: "A-012", customerName: "Andi" });
    onWideScreen(true);
    render(<OrdersScreen />);
    expect(await screen.findByRole("button", { name: /A1-260101-0002.*A-012 · Andi/ })).toBeInTheDocument();
  });

  it("puts the receipt search above the list", async () => {
    onWideScreen(false);
    render(<OrdersScreen />);
    const search = screen.getByRole("searchbox");
    const firstOrder = await screen.findByRole("button", { name: /A1-260101-0001/ });
    expect(search.compareDocumentPosition(firstOrder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
