import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { envelope, renderWithApi } from "../../../../tests/support/render";
import { ModifierGroupForm } from "./ModifierGroupForm";

describe("ModifierGroupForm", () => {
  it("creates a required single-choice group with its options", async () => {
    const { calls } = renderWithApi(<ModifierGroupForm onDone={vi.fn()} />, ({ method, body }) =>
      method === "POST" ? { status: 201, ...envelope({ id: "G1", ...(body as object) }) } : undefined,
    );

    await userEvent.type(screen.getByLabelText("Nama grup"), "Level Gula");
    await userEvent.click(screen.getByRole("radio", { name: "Wajib pilih 1" }));
    await userEvent.type(screen.getByLabelText("Pilihan 1"), "Normal");
    await userEvent.click(screen.getByRole("button", { name: "Tambah pilihan" }));
    await userEvent.type(screen.getByLabelText("Pilihan 2"), "Less Sugar");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() => expect(calls.at(-1)?.method).toBe("POST"));
    expect(calls.at(-1)!.body).toEqual({
      name: "Level Gula",
      min_select: 1,
      max_select: 1,
      options: [
        { name: "Normal", price: 0 },
        { name: "Less Sugar", price: 0 },
      ],
    });
  });
});
