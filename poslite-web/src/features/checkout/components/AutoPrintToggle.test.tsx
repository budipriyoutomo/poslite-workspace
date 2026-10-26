import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { getDb, readState } from "@/shared/db";

import { AutoPrintToggle } from "./AutoPrintToggle";

beforeEach(() => getDb().syncState.clear());

describe("AutoPrintToggle (15 · UX-03)", () => {
  it("starts off and remembers the choice on this device", async () => {
    render(<AutoPrintToggle />);
    const toggle = await screen.findByRole("checkbox", { name: "Cetak struk otomatis" });
    expect(toggle).not.toBeChecked();

    await userEvent.click(toggle);

    await waitFor(async () => expect(await readState(getDb(), "autoPrintReceipt")).toBe(true));
    expect(toggle).toBeChecked();
  });
});
