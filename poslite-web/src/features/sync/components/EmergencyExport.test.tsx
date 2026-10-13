import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmergencyExport } from "./EmergencyExport";

const MANAGERS = [{ id: "U2", name: "Bu Rina" }];

function setup(pinOk: boolean) {
  const download = vi.fn();
  const build = vi.fn(async () => ({ filename: "poslite-export-JKT01A-20261007-1612.json", content: "{}" }));
  render(<EmergencyExport managers={MANAGERS} verify={async () => pinOk} build={build} download={download} />);
  return { download, build };
}

describe("EmergencyExport (ADR-024)", () => {
  it("downloads the export after a manager's PIN", async () => {
    const { download } = setup(true);

    await userEvent.type(screen.getByLabelText("PIN manajer"), "2468");
    await userEvent.click(screen.getByRole("button", { name: "Export data darurat" }));

    await waitFor(() => expect(download).toHaveBeenCalledWith("poslite-export-JKT01A-20261007-1612.json", "{}"));
  });

  it("refuses a wrong PIN", async () => {
    const { build } = setup(false);

    await userEvent.type(screen.getByLabelText("PIN manajer"), "0000");
    await userEvent.click(screen.getByRole("button", { name: "Export data darurat" }));

    expect(await screen.findByText("PIN salah")).toBeInTheDocument();
    expect(build).not.toHaveBeenCalled();
  });
});
