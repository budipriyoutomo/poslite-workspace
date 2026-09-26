import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { TablesPanel } from "./TablesPanel";

const OUTLET = "01K5ZO00000000000000000001";
const A1 = { id: "01K5ZT00000000000000000001", label: "A1", area: "Dalam", seats: 4, sort_order: 0 };

function server(postReply?: { status: number; body: unknown }) {
  return renderWithApi(<TablesPanel outletId={OUTLET} />, ({ method, path, body }) => {
    if (method === "GET" && path === `/api/v1/outlets/${OUTLET}/tables`) return envelope([A1]);
    if (method === "POST") return postReply ?? { status: 201, ...envelope({ id: "01K5ZT00000000000000000002", ...(body as object) }) };
    if (method === "DELETE") return envelope(null);
    return undefined;
  });
}

describe("TablesPanel", () => {
  it("lists the outlet's tables", async () => {
    server();
    const a1 = within(await screen.findByRole("listitem", { name: "Meja A1" }));
    expect(a1.getByText("Dalam · 4 kursi")).toBeInTheDocument();
  });

  it("adds a table at the end of the list", async () => {
    const { calls } = server();
    await screen.findByRole("listitem", { name: "Meja A1" });
    await userEvent.type(screen.getByLabelText("Label meja"), "B2");
    await userEvent.type(screen.getByLabelText("Area"), "Teras");
    await userEvent.type(screen.getByLabelText("Kursi"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Tambah meja" }));

    await waitFor(() => expect(calls.find((c) => c.method === "POST")?.body).toEqual({ label: "B2", area: "Teras", seats: 2, sort_order: 1 }));
    expect(calls.find((c) => c.method === "POST")!.path).toBe(`/api/v1/outlets/${OUTLET}/tables`);
  });

  it("explains a label that is already used", async () => {
    server({ status: 409, body: { message: "taken", code: "TABLE_LABEL_TAKEN" } });
    await screen.findByRole("listitem", { name: "Meja A1" });
    await userEvent.type(screen.getByLabelText("Label meja"), "a1");
    await userEvent.click(screen.getByRole("button", { name: "Tambah meja" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Label meja sudah dipakai");
  });

  it("deletes a table after confirmation", async () => {
    const { calls } = server();
    await userEvent.click(within(await screen.findByRole("listitem", { name: "Meja A1" })).getByRole("button", { name: "Hapus A1" }));
    await userEvent.click(await screen.findByRole("button", { name: "Hapus" }));

    await waitFor(() => expect(calls.find((c) => c.method === "DELETE")?.path).toBe(`/api/v1/tables/${A1.id}`));
  });
});
