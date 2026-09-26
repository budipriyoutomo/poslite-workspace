import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { QrisCharge, QrisClient } from "../application/dynamic-qris";
import { DynamicQrisDialog } from "./DynamicQrisDialog";

const charge = (status: QrisCharge["status"]): QrisCharge => ({ id: "01K5ZK00000000000000000001", amount: 41_580, status, qrString: "FAKEQRIS|x|41580", expiresAt: "2026-09-27T03:15:00Z" });

describe("DynamicQrisDialog", () => {
  it("shows the QR for the amount and reports the payment once confirmed", async () => {
    const statuses: QrisCharge["status"][] = ["pending", "paid"];
    const client: QrisClient = { create: vi.fn(async () => charge("pending")), status: vi.fn(async () => charge(statuses.shift() ?? "paid")) };
    const onPaid = vi.fn();

    render(<DynamicQrisDialog amount={41_580} client={client} newId={() => "01K5ZK00000000000000000001"} pollMs={0} onPaid={onPaid} onClose={vi.fn()} />);

    expect(await screen.findByRole("img", { name: "QR pembayaran Rp 41.580" })).toBeInTheDocument();
    await waitFor(() => expect(onPaid).toHaveBeenCalledWith({ reference: "01K5ZK00000000000000000001", amount: 41_580 }));
    expect(client.create).toHaveBeenCalledWith("01K5ZK00000000000000000001", 41_580);
  });

  it("falls back to static QRIS when the server cannot be reached", async () => {
    const client: QrisClient = { create: vi.fn(async () => Promise.reject(new Error("offline"))), status: vi.fn() };

    render(<DynamicQrisDialog amount={41_580} client={client} newId={() => "X"} pollMs={0} onPaid={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Pakai QRIS statis");
  });

  it("says when the QR expired", async () => {
    const client: QrisClient = { create: vi.fn(async () => charge("pending")), status: vi.fn(async () => charge("expired")) };

    render(<DynamicQrisDialog amount={41_580} client={client} newId={() => "X"} pollMs={0} onPaid={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("QR kedaluwarsa");
  });
});
