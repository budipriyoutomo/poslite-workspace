import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_BRAND } from "../../../../tests/setup";
import { envelope, renderWithApi } from "../../../../tests/support/render";
import { DashboardScreen } from "./DashboardScreen";

const OUTLET = { id: "01K5ZT00000000000000000001", code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta" };
const SUMMARY = {
  days: [{ business_date: "2026-09-26", gross: 70_000, discount: 7_000, service: 3_150, tax: 6_615, net: 72_765, order_count: 1, void_count: 0 }],
  totals: { gross: 70_000, discount: 7_000, service: 3_150, tax: 6_615, net: 72_765, order_count: 1, void_count: 0 },
  payment_methods: [{ payment_method_id: "Y", method_type: "cash", amount: 72_765, count: 1 }],
  products: [{ product_id: "P", product_name: "Nasi Gudeg", quantity: 2, gross: 70_000 }],
  categories: [{ category_name: "Makanan", quantity: 2, gross: 70_000 }],
  cashiers: [{ cashier_id: "U", cashier_name: "Siti", order_count: 1, net: 72_765 }],
};

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-09-26T03:00:00Z") });
});

const access = (company: boolean) => ({
  tenant: { id: "T", name: "Warung", status: "active" },
  company_scope: company,
  brands: [{ id: TEST_BRAND, code: "MAHARASA", name: "Maharasa", role: company ? "owner" : "manager", outlets: [] }],
});

function server(company = true) {
  return renderWithApi(<DashboardScreen />, ({ path }) => {
    if (path === "/api/v1/me/access") return envelope(access(company));
    if (path.startsWith("/api/v1/outlets?brand_id=")) return envelope([OUTLET]);
    if (path.startsWith("/api/v1/reports/sales-summary?")) return envelope(SUMMARY);
    return undefined;
  });
}

describe("DashboardScreen", () => {
  it("shows the last 7 days of the selected outlet by default", async () => {
    const { calls } = server();

    expect(await screen.findByRole("status", { name: "Pendapatan" })).toHaveTextContent("Rp 72.765");
    expect(calls.find((c) => c.path.startsWith("/api/v1/reports"))?.path).toBe(
      `/api/v1/reports/sales-summary?outlet_id=${OUTLET.id}&from=2026-09-20&to=2026-09-26`,
    );
  });

  it("reports the whole active brand or the whole company (ADR-022)", async () => {
    const { calls } = server();
    await screen.findByRole("status", { name: "Pendapatan" });

    await userEvent.click(screen.getByRole("button", { name: "Semua outlet brand" }));
    await waitFor(() => expect(calls.at(-1)?.path).toBe(`/api/v1/reports/sales-summary?brand_id=${TEST_BRAND}&from=2026-09-20&to=2026-09-26`));

    await userEvent.click(screen.getByRole("button", { name: "Seluruh perusahaan" }));
    await waitFor(() => expect(calls.at(-1)?.path).toBe("/api/v1/reports/sales-summary?from=2026-09-20&to=2026-09-26"));
  });

  it("offers the company report only to company-wide users", async () => {
    server(false);
    await screen.findByRole("button", { name: "Semua outlet brand" });

    expect(screen.queryByRole("button", { name: "Seluruh perusahaan" })).not.toBeInTheDocument();
  });

  it("shows transactions, average ticket and discount", async () => {
    server();
    const tiles = await screen.findByRole("region", { name: "Ringkasan" });
    expect(within(tiles).getByLabelText("Rata-rata per transaksi")).toHaveTextContent("Rp 72.765");
    expect(within(tiles).getByLabelText("Transaksi")).toHaveTextContent("1");
    expect(within(tiles).getByLabelText("Diskon")).toHaveTextContent("Rp 7.000");
  });

  it("switches the range with a preset", async () => {
    const { calls } = server();
    await screen.findByRole("status", { name: "Pendapatan" });

    await userEvent.click(screen.getByRole("button", { name: "Hari ini" }));

    await waitFor(() => expect(calls.at(-1)?.path).toContain("from=2026-09-26&to=2026-09-26"));
  });

  it("lists the best-selling menu items", async () => {
    server();
    const table = await screen.findByRole("table", { name: "Menu terlaris" });
    expect(within(table).getByText("Nasi Gudeg")).toBeInTheDocument();
  });
});
