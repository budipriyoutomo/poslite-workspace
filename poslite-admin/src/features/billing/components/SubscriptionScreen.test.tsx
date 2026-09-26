import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { SubscriptionScreen } from "./SubscriptionScreen";

const invoice = (over: object) => ({
  id: "01K5ZI00000000000000000001",
  period_start: "2026-09-15",
  period_end: "2026-10-15",
  outlet_count: 2,
  unit_price: 150_000,
  amount: 300_000,
  status: "open",
  due_at: "2026-09-22T00:00:00Z",
  paid_at: null,
  payment_url: "http://localhost:8000/api/v1/gateway/fake/pay/fake_01K5ZI00000000000000000001",
  ...over,
});

function server(subscription: unknown) {
  return renderWithApi(<SubscriptionScreen />, ({ path }) => (path === "/api/v1/billing/subscription" ? envelope(subscription) : undefined));
}

describe("SubscriptionScreen", () => {
  it("shows the trial and when it ends", async () => {
    server({ status: "trialing", trial_ends_at: "2026-10-01T03:00:00Z", current_period_end: null, invoices: [] });

    expect(await screen.findByText("Masa coba")).toBeInTheDocument();
    expect(screen.getByText(/berakhir 1 Okt 2026/)).toBeInTheDocument();
  });

  it("lists invoices with a pay link for an open one", async () => {
    const open = invoice({});
    server({ status: "past_due", trial_ends_at: "2026-09-15T03:00:00Z", current_period_end: null, invoices: [open, invoice({ id: "01K5ZI00000000000000000002", status: "paid", payment_url: null, period_start: "2026-08-15", period_end: "2026-09-15" })] });

    expect(await screen.findByRole("alert")).toHaveTextContent("Tagihan belum dibayar");
    const row = within(screen.getByRole("row", { name: /^Periode 15 Sep 2026/ }));
    expect(row.getByText("Rp 300.000")).toBeInTheDocument();
    expect(row.getByText("2 outlet × Rp 150.000")).toBeInTheDocument();
    expect(row.getByRole("link", { name: "Bayar" })).toHaveAttribute("href", open.payment_url);
    expect(within(screen.getByRole("row", { name: /^Periode 15 Agu 2026/ })).getByText("Lunas")).toBeInTheDocument();
  });

  it("explains when the subscription has not been set up yet", async () => {
    server(null);

    expect(await screen.findByText(/sedang disiapkan/)).toBeInTheDocument();
  });
});
