import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TEST_BRAND } from "../../../../tests/setup";
import { envelope, renderWithApi } from "../../../../tests/support/render";
import { DayClosingScreen } from "./DayClosingScreen";

const OUTLET = { id: "01K5ZT00000000000000000001", code: "JKT01", name: "Kemang", timezone: "Asia/Jakarta" };
const TOTALS = { gross: 70_000, discount: 7_000, service: 3_150, tax: 6_615, net: 72_765, order_count: 1, void_count: 0, refund_amount: 0, refund_count: 0 };
const CASH = { shift_count: 1, open_shift_count: 0, opening_cash: 200_000, expected_cash: 252_765, counted_cash: 250_000, variance: -2_765 };
const SNAPSHOT = {
  totals: TOTALS,
  payment_methods: [{ payment_method_id: "Y", method_type: "cash", amount: 72_765, count: 1, refund_amount: 0 }],
  cash: CASH,
  warnings: [] as unknown[],
};
const OPEN_SHIFT = { code: "OPEN_SHIFTS", count: 1, devices: null };
const CLOSING = { id: "C1", outlet_id: OUTLET.id, business_date: "2026-09-25", closed_by: "U1", closed_by_name: "Budi", closed_at: "2026-09-26T02:00:00Z", notes: "Setor bank", snapshot: SNAPSHOT };

const access = {
  tenant: { id: "T", name: "Warung", status: "active" },
  company_scope: true,
  brands: [{ id: TEST_BRAND, code: "MAHARASA", name: "Maharasa", role: "owner", outlets: [] }],
};

type Day = { day_ended: boolean; current: typeof SNAPSHOT; closing: typeof CLOSING | null; changed_since_close: boolean };

function server(day: Day) {
  let state = day;
  return renderWithApi(<DayClosingScreen />, ({ method, path, body }) => {
    if (path === "/api/v1/me/access") return envelope(access);
    if (path.startsWith("/api/v1/outlets?brand_id=")) return envelope([OUTLET]);
    if (path.startsWith("/api/v1/day-closings/day?")) return envelope({ outlet_id: OUTLET.id, business_date: "2026-09-25", ...state });
    if (method === "POST" && path === "/api/v1/day-closings") {
      const closing = { ...CLOSING, notes: (body as { notes: string }).notes, snapshot: state.current };
      state = { ...state, closing };
      return { status: 201, ...envelope(closing) };
    }
    if (path.startsWith("/api/v1/day-closings?")) return envelope([]);
    return undefined;
  });
}

beforeEach(() => {
  localStorage.clear();
  // 26 Sep 10:00 WIB: business date 26 Sep, so the default day to close is the 25th.
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-09-26T03:00:00Z") });
});

describe("DayClosingScreen", () => {
  it("shows yesterday's sales and cash of the selected outlet, not closed yet", async () => {
    const { calls } = server({ day_ended: true, current: SNAPSHOT, closing: null, changed_since_close: false });

    expect(await screen.findByText("Belum ditutup")).toBeInTheDocument();
    expect(calls.find((c) => c.path.startsWith("/api/v1/day-closings/day"))?.path).toBe(`/api/v1/day-closings/day?outlet_id=${OUTLET.id}&business_date=2026-09-25`);
    expect(screen.getByRole("status", { name: "Penjualan bersih" })).toHaveTextContent("Rp 72.765");
    expect(screen.getByRole("status", { name: "Selisih kas" })).toHaveTextContent("-Rp 2.765");
  });

  it("closes the day with a note once the warnings are acknowledged", async () => {
    const { calls } = server({ day_ended: true, current: { ...SNAPSHOT, warnings: [OPEN_SHIFT] }, closing: null, changed_since_close: false });
    expect(await screen.findByText(/1 shift masih terbuka/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Tutup hari" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Catatan"), "Setor bank");
    const confirm = within(dialog).getByRole("button", { name: "Tutup hari" });
    expect(confirm).toBeDisabled();
    await userEvent.click(within(dialog).getByRole("checkbox"));
    await userEvent.click(confirm);

    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({ outlet_id: OUTLET.id, business_date: "2026-09-25", notes: "Setor bank" }),
    );
    expect(await screen.findByText(/Ditutup oleh Budi/)).toBeInTheDocument();
  });

  it("warns when sales arrived after the day was closed", async () => {
    const later = { ...SNAPSHOT, totals: { ...TOTALS, net: 100_000 } };
    server({ day_ended: true, current: later, closing: CLOSING, changed_since_close: true });

    expect(await screen.findByRole("alert")).toHaveTextContent(/data masuk setelah hari ditutup/i);
    expect(screen.getByRole("alert")).toHaveTextContent("Rp 100.000");
    expect(screen.getByRole("status", { name: "Penjualan bersih" })).toHaveTextContent("Rp 72.765");
    expect(screen.queryByRole("button", { name: "Tutup hari" })).not.toBeInTheDocument();
  });

  it("cannot close a day that has not ended", async () => {
    server({ day_ended: false, current: SNAPSHOT, closing: null, changed_since_close: false });

    expect(await screen.findByText(/Hari operasional belum berakhir/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tutup hari" })).toBeDisabled();
  });
});
