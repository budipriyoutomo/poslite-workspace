import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { DashboardScreen } from "./DashboardScreen";

const SUMMARY = {
  tenants: 12,
  active_tenants: 10,
  suspended_tenants: 2,
  trialing: 4,
  paying: 6,
  past_due: 2,
  outlets: 31,
  devices: 45,
  monthly_recurring_revenue: 2_700_000,
  open_invoice_amount: 450_000,
};

describe("DashboardScreen", () => {
  it("summarises tenants, subscriptions and revenue", async () => {
    renderWithApi(<DashboardScreen />, ({ path }) => (path === "/api/v1/platform/summary" ? envelope(SUMMARY) : undefined));

    expect(await screen.findByLabelText("Total tenant")).toHaveTextContent("12");
    expect(screen.getByLabelText("Ditangguhkan")).toHaveTextContent("2");
    expect(screen.getByLabelText("Masa coba")).toHaveTextContent("4");
    expect(screen.getByLabelText("Menunggak")).toHaveTextContent("2");
    expect(screen.getByLabelText("Pendapatan bulanan (MRR)")).toHaveTextContent("Rp 2.700.000");
    expect(screen.getByLabelText("Tagihan belum dibayar")).toHaveTextContent("Rp 450.000");
    expect(screen.getByLabelText("Outlet aktif")).toHaveTextContent("31");
  });
});
