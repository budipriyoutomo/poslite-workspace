import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ModifierGroupRow, ProductRow } from "@/shared/db";

import { LineEditorDialog } from "./LineEditorDialog";

const esTeh: ProductRow = { id: "P5", categoryId: "C2", sku: "MN-001", name: "Es Teh Manis", price: 5_000, imageKey: null, isAvailable: true, modifierGroupIds: ["G5", "G6"] };
const groups: ModifierGroupRow[] = [
  { id: "G5", name: "Level Gula", minSelect: 1, maxSelect: 1, options: [{ id: "normal", name: "Normal", price: 0 }, { id: "less", name: "Less Sugar", price: 0 }] },
  { id: "G6", name: "Topping", minSelect: 0, maxSelect: 1, options: [{ id: "boba", name: "Extra Boba", price: 5_000 }] },
];

const setup = (onConfirm = vi.fn()) => {
  render(<LineEditorDialog open product={esTeh} groups={groups} onConfirm={onConfirm} onOpenChange={vi.fn()} />);
  return onConfirm;
};

describe("LineEditorDialog", () => {
  it("requires a choice in a required group before adding", async () => {
    setup();
    expect(screen.getByRole("button", { name: /Tambah/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Less Sugar" }));
    expect(screen.getByRole("button", { name: /Tambah/ })).toBeEnabled();
  });

  it("shows the unit price including chosen add-ons", async () => {
    setup();
    await userEvent.click(screen.getByRole("radio", { name: "Normal" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Extra Boba/ }));
    expect(screen.getByRole("button", { name: /Tambah/ })).toHaveTextContent("Rp 10.000");
  });

  it("returns the chosen modifiers with their group and the trimmed note", async () => {
    const onConfirm = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Less Sugar" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Extra Boba/ }));
    await userEvent.type(screen.getByLabelText("Catatan"), "  es sedikit ");
    await userEvent.click(screen.getByRole("button", { name: /Tambah/ }));
    expect(onConfirm).toHaveBeenCalledWith({
      modifiers: [
        { optionId: "less", groupId: "G5", name: "Less Sugar", price: 0 },
        { optionId: "boba", groupId: "G6", name: "Extra Boba", price: 5_000 },
      ],
      note: "es sedikit",
    });
  });

  it("starts from the line's current choices when editing", () => {
    render(
      <LineEditorDialog open product={esTeh} groups={groups} initial={{ optionIds: ["less"], note: "tanpa es" }} onConfirm={vi.fn()} onOpenChange={vi.fn()} />,
    );
    expect(screen.getByRole("radio", { name: "Less Sugar" })).toBeChecked();
    expect(screen.getByLabelText("Catatan")).toHaveValue("tanpa es");
    expect(screen.getByRole("button", { name: /Simpan/ })).toBeEnabled();
  });
});
