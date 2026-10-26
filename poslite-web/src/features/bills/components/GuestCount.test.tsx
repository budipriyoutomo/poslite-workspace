import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { GuestCount } from "./GuestCount";

function Harness({ initial = null }: { initial?: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  return <GuestCount value={value} onChange={setValue} />;
}

describe("GuestCount (15 · UX-04)", () => {
  it("starts unasked and counts up from one guest", async () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Jumlah tamu" })).toHaveTextContent("Tamu");
    expect(screen.getByRole("button", { name: "Kurangi tamu" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Tambah tamu" }));
    await userEvent.click(screen.getByRole("button", { name: "Tambah tamu" }));

    expect(screen.getByRole("group", { name: "Jumlah tamu" })).toHaveTextContent("2 tamu");
  });

  it("never goes below one guest once asked", async () => {
    render(<Harness initial={1} />);
    expect(screen.getByRole("button", { name: "Kurangi tamu" })).toBeDisabled();
  });
});
