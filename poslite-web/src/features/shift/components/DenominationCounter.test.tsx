import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { DenominationCounter } from "./DenominationCounter";

function Harness() {
  const [count, setCount] = useState<Record<number, number>>({});
  return <DenominationCounter value={count} onChange={setCount} />;
}

describe("DenominationCounter (15 · UX-02)", () => {
  it("has one field per note from Rp 100.000 down to Rp 1.000, and the coins' total", () => {
    render(<Harness />);
    for (const note of ["100.000", "50.000", "20.000", "10.000", "5.000", "2.000", "1.000"]) {
      expect(screen.getByLabelText(`Lembar Rp ${note}`)).toBeInTheDocument();
    }
    expect(screen.getByLabelText("Total koin")).toBeInTheDocument();
  });

  it("adds up the notes and coins as the cashier types", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Lembar Rp 100.000"), "2");
    await userEvent.type(screen.getByLabelText("Lembar Rp 5.000"), "3");
    await userEvent.type(screen.getByLabelText("Total koin"), "1500");

    expect(screen.getByRole("status", { name: "Total dihitung" })).toHaveTextContent("Rp 216.500");
  });

  it("takes digits only", async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText("Lembar Rp 10.000"), "1a-.5");

    expect(screen.getByLabelText("Lembar Rp 10.000")).toHaveValue("15");
    expect(screen.getByRole("status", { name: "Total dihitung" })).toHaveTextContent("Rp 150.000");
  });
});
