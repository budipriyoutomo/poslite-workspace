import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { SplitPicker } from "./SplitPicker";

const lines = [
  { key: "k", name: "Kopi", quantity: 3 },
  { key: "n", name: "Nasi", quantity: 1 },
];

function Harness({ onTake }: { onTake: (take: Record<string, number>) => void }) {
  const [take, setTake] = useState<Record<string, number>>({});
  return <SplitPicker lines={lines} take={take} onChange={(t) => (setTake(t), onTake(t))} />;
}

describe("SplitPicker", () => {
  it("chooses how many of each line to pay now, within the line's quantity", async () => {
    let last: Record<string, number> = {};
    render(<Harness onTake={(t) => (last = t)} />);

    await userEvent.click(screen.getByRole("button", { name: "Tambah Kopi dibayar" }));
    await userEvent.click(screen.getByRole("button", { name: "Tambah Kopi dibayar" }));
    await userEvent.click(screen.getByRole("button", { name: "Semua Nasi" }));

    expect(last).toEqual({ k: 2, n: 1 });
    expect(screen.getByLabelText("Kopi dibayar")).toHaveTextContent("2 / 3");
    expect(screen.getByRole("button", { name: "Tambah Nasi dibayar" })).toBeDisabled();
  });
});
