import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { MenuImportDialog } from "./MenuImportDialog";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const COUNTS = { categories: { create: 1, update: 0 }, modifier_groups: { create: 1, update: 0 }, products: { create: 200, update: 3 }, channel_prices: 0, outlet_prices: 2 };

function server(errors: unknown[] = []) {
  return renderWithApi(<MenuImportDialog open onOpenChange={() => {}} />, ({ method, path }) => {
    if (method !== "POST") return undefined;
    const isPreview = path.endsWith("dry_run=true");
    return envelope({ ...COUNTS, errors, applied: !isPreview && errors.length === 0 });
  });
}

const choose = () => userEvent.upload(screen.getByLabelText("File menu (.xlsx)"), new File([new Uint8Array([1, 2, 3])], "menu.xlsx", { type: XLSX }));

// P1-4: preview first (every row checked), then import in one go.
describe("MenuImportDialog", () => {
  it("previews what the file would change, then imports it", async () => {
    const { calls } = server();
    await choose();
    await userEvent.click(screen.getByRole("button", { name: "Periksa file" }));

    expect(await screen.findByText("Produk: 200 baru, 3 diperbarui")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Import menu" }));

    expect(await screen.findByText("Menu berhasil diimport")).toBeInTheDocument();
    expect(calls.map((c) => c.path)).toEqual(["/api/v1/menu-import?dry_run=true", "/api/v1/menu-import?dry_run=false"]);
    expect(calls[0]!.body).toEqual({ type: XLSX, size: 3 });
  });

  it("lists every bad row and does not offer to import", async () => {
    server([{ sheet: "products", row: 4, message: "Harga harus bilangan bulat ≥ 0" }]);
    await choose();
    await userEvent.click(screen.getByRole("button", { name: "Periksa file" }));

    expect(await screen.findByText("products baris 4: Harga harus bilangan bulat ≥ 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import menu" })).not.toBeInTheDocument();
  });

  it("offers the template", async () => {
    server();
    await waitFor(() => expect(screen.getByRole("button", { name: "Unduh template" })).toBeInTheDocument());
  });
});
