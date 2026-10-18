import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { OrderRow } from "@/shared/db";

import { OrderPlacedDialog } from "./OrderPlacedDialog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

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
  subtotal: 46_200,
  discountAmount: 0,
  serviceCharge: 0,
  tax: 0,
  total: 46_200,
  paidAmount: 50_000,
  changeAmount: 3_800,
  status: "paid",
  syncStatus: "pending",
  flags: [],
  createdAt: "2026-01-01T10:00:00.000Z",
};

describe("OrderPlacedDialog", () => {
  it("shows the change to hand back", () => {
    render(<OrderPlacedDialog order={order} />);
    expect(screen.getByRole("status", { name: "Kembalian" })).toHaveTextContent("Rp 3.800");
  });

  it("is ready for the next order with one tap or Enter", () => {
    render(<OrderPlacedDialog order={order} />);
    expect(screen.getByRole("button", { name: "Pesanan Baru" })).toHaveFocus();
  });
});
