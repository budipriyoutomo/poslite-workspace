import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { OutletSettingsForm } from "./OutletSettingsForm";

const ID = "01K5ZO00000000000000000001";
const SETTINGS = {
  id: ID,
  code: "JKT01",
  name: "Kemang",
  timezone: "Asia/Jakarta",
  business_day_cutoff: "04:00",
  tax_rate_bps: 1000,
  service_rate_bps: 550,
  receipt_header: "Kopi Maharasa",
  receipt_footer: "",
};

function server() {
  return renderWithApi(<OutletSettingsForm outletId={ID} />, ({ method, path, body }) => {
    if (method === "GET" && path === `/api/v1/outlets/${ID}`) return envelope(SETTINGS);
    if (method === "PUT" && path === `/api/v1/outlets/${ID}`) return envelope({ ...SETTINGS, ...(body as object) });
    return undefined;
  });
}

describe("OutletSettingsForm", () => {
  it("shows the current settings with rates as percentages", async () => {
    server();
    expect(await screen.findByLabelText("Pajak (%)")).toHaveValue("10");
    expect(screen.getByLabelText("Service charge (%)")).toHaveValue("5,5");
    expect(screen.getByLabelText("Tutup hari bisnis")).toHaveValue("04:00");
  });

  it("saves rates as basis points", async () => {
    const { calls } = server();
    const tax = await screen.findByLabelText("Pajak (%)");
    await userEvent.clear(tax);
    await userEvent.type(tax, "11");
    await userEvent.clear(screen.getByLabelText("Service charge (%)"));
    await userEvent.click(screen.getByRole("button", { name: "Simpan pengaturan" }));

    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
      name: "Kemang",
      timezone: "Asia/Jakarta",
      business_day_cutoff: "04:00",
      tax_rate_bps: 1100,
      service_rate_bps: 0,
      receipt_header: "Kopi Maharasa",
      receipt_footer: "",
    });
  });

  it("does not save an invalid rate", async () => {
    server();
    const tax = await screen.findByLabelText("Pajak (%)");
    await userEvent.clear(tax);
    await userEvent.type(tax, "12,345");

    expect(screen.getByRole("button", { name: "Simpan pengaturan" })).toBeDisabled();
  });
});
