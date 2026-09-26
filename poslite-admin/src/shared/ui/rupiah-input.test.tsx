import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { RupiahInput } from "./rupiah-input";

function Harness({ onValue }: { onValue: (v: number | null) => void }) {
  const [value, setValue] = useState<number | null>(null);
  return (
    <RupiahInput
      id="price"
      aria-label="Harga"
      value={value}
      onValueChange={(v) => {
        setValue(v);
        onValue(v);
      }}
    />
  );
}

describe("RupiahInput", () => {
  it("keeps digits only and shows thousands separators", async () => {
    const values: (number | null)[] = [];
    render(<Harness onValue={(v) => values.push(v)} />);
    await userEvent.type(screen.getByLabelText("Harga"), "25.000,5x");
    expect(screen.getByLabelText("Harga")).toHaveValue("250.005");
    expect(values.at(-1)).toBe(250_005);
  });

  it("is empty (null) when cleared", async () => {
    const values: (number | null)[] = [];
    render(<Harness onValue={(v) => values.push(v)} />);
    await userEvent.type(screen.getByLabelText("Harga"), "5");
    await userEvent.clear(screen.getByLabelText("Harga"));
    expect(values.at(-1)).toBeNull();
  });
});
