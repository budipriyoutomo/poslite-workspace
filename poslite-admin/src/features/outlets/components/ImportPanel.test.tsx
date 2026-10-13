import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { ImportPanel } from "./ImportPanel";

const DEVICE = "01K5ZD00000000000000000001";
const FILE = { format: "poslite-device-export", version: 1, outlet_id: "O", device_id: DEVICE, events: [], checksum: "x" };
const RESULT = { import_id: "01K5ZI00000000000000000001", device_id: DEVICE, accepted: 3, duplicate: 1, flagged: 0, rejected: [{ id: "01K5ZE00000000000000000009", code: "CASHIER_NOT_IN_OUTLET" }], created_at: "2026-10-07T09:30:00Z" };

const exportFile = (body: object = FILE) => new File([JSON.stringify(body)], "poslite-export-JKT01A-20261007-1612.json", { type: "application/json" });

describe("ImportPanel (ADR-024)", () => {
  it("imports a device export and shows what happened to each event", async () => {
    const { calls } = renderWithApi(<ImportPanel />, ({ method, path }) => {
      if (method === "POST" && path === "/api/v1/imports/device-export") return { status: 201, ...envelope(RESULT) };
      if (method === "GET" && path === `/api/v1/imports?device_id=${DEVICE}`) return envelope([RESULT]);
      return undefined;
    });

    await userEvent.upload(screen.getByLabelText("File export darurat"), exportFile());

    const result = await screen.findByRole("region", { name: "Hasil import" });
    expect(result).toHaveTextContent("3 diterima · 1 sudah ada · 0 ditandai · 1 ditolak");
    expect(within(result).getByText("CASHIER_NOT_IN_OUTLET")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual(FILE);
  });

  it("offers an Indonesian file button instead of the browser's own", () => {
    renderWithApi(<ImportPanel />, () => undefined);

    expect(screen.getByText("Pilih file export")).toBeInTheDocument();
  });

  it("explains a damaged file", async () => {
    renderWithApi(<ImportPanel />, () => ({ status: 422, body: { message: "damaged", code: "EXPORT_CHECKSUM_MISMATCH" } }));

    await userEvent.upload(screen.getByLabelText("File export darurat"), exportFile());

    expect(await screen.findByRole("alert")).toHaveTextContent("File rusak atau sudah diubah");
  });
});
