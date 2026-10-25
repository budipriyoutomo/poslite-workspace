import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PrinterAddressForm } from "./PrinterAddressForm";

// P1-5: the cashier types the 6-digit code shown on the bridge PC instead of a long token.
describe("PrinterAddressForm pairing", () => {
  it("pairs with the Print Bridge code and saves the token it hands back", async () => {
    const pair = vi.fn(async () => "token-dari-bridge");
    const onSave = vi.fn();
    render(<PrinterAddressForm id="r" isBridge device={undefined} isBusy={false} onSave={onSave} pair={pair} />);

    await userEvent.type(screen.getByLabelText("Alamat Print Bridge"), "http://localhost:9180");
    await userEvent.type(screen.getByLabelText("Kode pairing"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Pasangkan" }));
    await waitFor(() => expect(screen.getByLabelText("Token Print Bridge")).toHaveValue("token-dari-bridge"));
    await userEvent.type(screen.getByLabelText("Alamat printer"), "192.168.1.60:9100");
    await userEvent.click(screen.getByRole("button", { name: /Simpan alamat/ }));

    expect(pair).toHaveBeenCalledWith("http://localhost:9180", "123456");
    expect(onSave).toHaveBeenCalledWith({ bridgeUrl: "http://localhost:9180", bridgeToken: "token-dari-bridge", address: "192.168.1.60:9100" });
  });

  it("says when the code is wrong", async () => {
    const pair = vi.fn(async () => {
      throw new Error("INVALID_CODE");
    });
    render(<PrinterAddressForm id="r" isBridge device={undefined} isBusy={false} onSave={vi.fn()} pair={pair} />);

    await userEvent.type(screen.getByLabelText("Alamat Print Bridge"), "http://localhost:9180");
    await userEvent.type(screen.getByLabelText("Kode pairing"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Pasangkan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Kode salah atau sudah berganti");
  });
});
