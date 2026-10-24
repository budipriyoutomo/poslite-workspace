import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_BRAND } from "../../../../tests/setup";
import { envelope, renderWithApi } from "../../../../tests/support/render";
import { BillVoidsScreen } from "./BillVoidsScreen";

const OUTLET = { id: "01K5ZT00000000000000000001", code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta" };
const VOID = {
  id: "V1",
  outlet_id: OUTLET.id,
  device_id: "D1",
  shift_id: "S1",
  business_date: "2026-09-26",
  bill_id: "B1",
  scope: "bill_cancelled",
  table_label: "B1",
  cashier_id: "U1",
  cashier_name: "Siti",
  approved_by: "U2",
  approver_name: "Budi",
  reason: "Salah input",
  amount: 58_000,
  voided_at: "2026-09-26T05:20:00Z",
  lines: [
    { product_id: "P1", product_name: "Nasi Gudeg", modifiers: [], unit_price: 25_000, quantity: 2, amount: 50_000 },
    { product_id: "P2", product_name: "Es Teh", modifiers: [], unit_price: 8_000, quantity: 1, amount: 8_000 },
  ],
};
const access = {
  tenant: { id: "T", name: "Warung", status: "active" },
  company_scope: true,
  brands: [{ id: TEST_BRAND, code: "MAHARASA", name: "Maharasa", role: "owner", outlets: [] }],
};

function server(voids: unknown[]) {
  return renderWithApi(<BillVoidsScreen />, ({ path }) => {
    if (path === "/api/v1/me/access") return envelope(access);
    if (path.startsWith("/api/v1/outlets?brand_id=")) return envelope([OUTLET]);
    if (path.startsWith("/api/v1/reports/bill-voids?")) return envelope({ voids, totals: { count: voids.length, amount: voids.length * 58_000 } });
    return undefined;
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-09-26T03:00:00Z") });
});

describe("BillVoidsScreen (ADR-028)", () => {
  it("lists who cancelled what after the kitchen had it, and who approved, for the selected outlet", async () => {
    const { calls } = server([VOID]);

    const table = await screen.findByRole("table", { name: "Batal sebelum bayar" });
    expect(within(table).getByRole("row", { name: /B1.*Bill dibatalkan.*2x Nasi Gudeg, 1x Es Teh.*Rp 58\.000.*Salah input.*Siti.*Budi/ })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Total batal sebelum bayar" })).toHaveTextContent("Rp 58.000 · 1 kejadian");
    expect(calls.find((c) => c.path.startsWith("/api/v1/reports/bill-voids"))?.path).toBe(`/api/v1/reports/bill-voids?outlet_id=${OUTLET.id}&from=2026-09-20&to=2026-09-26`);
  });

  it("says so when nothing was cancelled", async () => {
    server([]);

    expect(await screen.findByText("Tidak ada item yang dibatalkan setelah masuk dapur.")).toBeInTheDocument();
  });
});
