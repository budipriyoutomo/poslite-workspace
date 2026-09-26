import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { PromotionsScreen } from "./PromotionsScreen";

const HAPPY = {
  id: "01K5ZQ00000000000000000001",
  name: "Happy hour",
  type: "percent_off",
  percentage: 20,
  buy_qty: null,
  get_qty: null,
  product_ids: [],
  category_ids: [],
  outlet_ids: [],
  days_of_week: [],
  start_time: "14:00",
  end_time: "17:00",
  starts_on: null,
  ends_on: null,
  is_active: true,
};

function server() {
  return renderWithApi(<PromotionsScreen />, ({ method, path, body }) => {
    if (method === "GET" && path === "/api/v1/promotions") return envelope([HAPPY]);
    if (method === "PUT") return envelope({ ...HAPPY, ...(body as object) });
    if (method === "DELETE") return envelope(null);
    if (method === "GET") return envelope([]);
    return undefined;
  });
}

describe("PromotionsScreen", () => {
  it("lists promotions with their rule and schedule", async () => {
    server();
    const row = within(await screen.findByRole("listitem", { name: "Happy hour" }));
    expect(row.getByText("Diskon 20% · 14:00–17:00")).toBeInTheDocument();
  });

  it("switches a promotion off without deleting it", async () => {
    const { calls } = server();
    await userEvent.click(within(await screen.findByRole("listitem", { name: "Happy hour" })).getByRole("switch", { name: "Aktif Happy hour" }));

    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toMatchObject({ path: `/api/v1/promotions/${HAPPY.id}`, body: { is_active: false, percentage: 20 } }));
    expect((calls.find((c) => c.method === "PUT")!.body as { id?: string }).id).toBeUndefined();
  });

  it("deletes a promotion after confirmation", async () => {
    const { calls } = server();
    await userEvent.click(within(await screen.findByRole("listitem", { name: "Happy hour" })).getByRole("button", { name: "Hapus Happy hour" }));
    await userEvent.click(await screen.findByRole("button", { name: "Hapus" }));

    await waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe(`/api/v1/promotions/${HAPPY.id}`));
  });
});
