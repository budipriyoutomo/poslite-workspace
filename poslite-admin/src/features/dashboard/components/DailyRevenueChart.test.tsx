import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DailyRevenueChart } from "./DailyRevenueChart";

const DAYS = [
  { business_date: "2026-09-24", net: 50_000 },
  { business_date: "2026-09-26", net: 72_765 },
];

describe("DailyRevenueChart", () => {
  it("draws one column per day of the range, empty days included", () => {
    render(<DailyRevenueChart from="2026-09-24" to="2026-09-26" days={DAYS} />);
    const chart = screen.getByRole("img", { name: /Pendapatan harian/ });
    expect(within(chart).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
      "24 Sep: Rp 50.000",
      "25 Sep: Rp 0",
      "26 Sep: Rp 72.765",
    ]);
  });

  it("shows the exact value in a tooltip on keyboard focus", () => {
    render(<DailyRevenueChart from="2026-09-24" to="2026-09-26" days={DAYS} />);
    fireEvent.focus(screen.getByRole("button", { name: "26 Sep: Rp 72.765" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Rp 72.765");
  });

  it("offers the same numbers as a table", () => {
    render(<DailyRevenueChart from="2026-09-24" to="2026-09-26" days={DAYS} />);
    const table = screen.getByRole("table", { name: "Pendapatan harian (tabel)" });
    expect(within(table).getAllByRole("row")).toHaveLength(4); // header + 3 days
  });
});
