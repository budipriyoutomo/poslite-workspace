import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useSession } from "@/features/auth";
import { getDb, type OrderRow, type UserRole } from "@/shared/db";

import { ReportsScreen } from "./ReportsScreen";

const SHIFT = "01SHIFT";

const order = (o: Partial<OrderRow>): OrderRow => ({
  id: "01ORDER",
  shiftId: SHIFT,
  receiptNo: "A1-260101-0001",
  cashierId: "U1",
  cashierName: "Siti",
  businessDate: "2026-01-01",
  orderType: "dine_in",
  lines: [],
  discount: null,
  rates: { serviceBps: 500, taxBps: 1_000 },
  subtotal: 40_000,
  discountAmount: 0,
  serviceCharge: 2_000,
  tax: 4_200,
  total: 46_200,
  paidAmount: 50_000,
  changeAmount: 3_800,
  status: "paid",
  syncStatus: "synced",
  flags: [],
  createdAt: "2026-01-01T10:00:00.000Z",
  ...o,
});

const renderAs = (role: UserRole) => {
  useSession.setState({ user: { id: "U1", name: "Siti", role } });
  render(<ReportsScreen />);
};

const stat = async (label: string) => within(await screen.findByRole("group", { name: label })).getByText(/^Rp/).textContent;

// The example of 15 · UX-10: Rp 46.200 taken, Rp 40.000 of it sales.
beforeEach(async () => {
  const db = getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.shifts.put({ id: SHIFT, openedBy: "U1", openedAt: "2026-01-01T08:00:00.000Z", openingCash: 0, businessDate: "2026-01-01", status: "open" });
  await db.orders.bulkPut([
    order({ channelId: "C1", channelName: "Dine In" }),
    order({ id: "01ORDER2", receiptNo: "A1-260101-0002", orderType: "take_away", channelId: null, channelName: null, subtotal: 10_000, serviceCharge: 0, tax: 0, total: 10_000, paidAmount: 10_000, changeAmount: 0 }),
  ]);
  await db.billVoids.add({ id: "01VOID", shiftId: SHIFT, billId: "01BILL", scope: "line", amount: 18_000, createdAt: "2026-01-01T09:00:00.000Z" });
});

describe("ReportsScreen (15 · UX-10)", () => {
  it("shows the total taken apart from net sales", async () => {
    renderAs("cashier");
    expect(await stat("Total diterima")).toBe("Rp 56.200");
    expect(await stat("Penjualan bersih")).toBe("Rp 50.000");
  });

  it("shows service and PB1 apart", async () => {
    renderAs("cashier");
    expect(await stat("Service")).toBe("Rp 2.000");
    expect(await stat("PB1")).toBe("Rp 4.200");
  });

  it("totals sales per channel, older orders under their order type", async () => {
    renderAs("cashier");
    const channels = await screen.findByRole("table", { name: "Per Channel" });
    expect(within(channels).getAllByRole("row").map((r) => r.textContent)).toEqual(["Dine In1×Rp 46.200", "Bawa pulang1×Rp 10.000"]);
  });

  it("shows a manager the voids before payment", async () => {
    renderAs("manager");
    expect(await screen.findByRole("status", { name: "Void sebelum bayar" })).toHaveTextContent("1 · Rp 18.000");
  });

  it("hides the voids before payment from a cashier", async () => {
    renderAs("cashier");
    await screen.findByRole("group", { name: "Total diterima" });
    expect(screen.queryByRole("status", { name: "Void sebelum bayar" })).not.toBeInTheDocument();
  });
});
