import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PosDb, PrintJobRow } from "@/shared/db";

import { createTestDb } from "../../../../tests/support/test-db";
import { StationAlert } from "./StationAlert";

let db: PosDb;
const failed = (id: string, orderId: string, role: PrintJobRow["role"]): PrintJobRow => ({ id, orderId, role, documentType: "kitchen_ticket", status: "failed", attempts: 1, createdAt: `2026-11-03T10:00:0${id.length}.000Z` });

beforeEach(async () => {
  db = createTestDb();
  await db.printers.bulkPut([
    { id: "R", role: "receipt", driver: "web-usb", name: "Struk", paperWidth: 58, device: {} },
    { id: "K", role: "kitchen", driver: "bridge", name: "Dapur", paperWidth: 80, device: {} },
  ]);
});

describe("StationAlert (15 · UX-08)", () => {
  it("tells the cashier the kitchen gets no orders, with a way to try again", async () => {
    await db.printJobs.bulkAdd([failed("J1", "B1", "kitchen"), failed("J22", "B2", "kitchen")]);
    const onRetry = vi.fn();
    render(<StationAlert db={db} onRetry={onRetry} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Printer dapur tidak terjangkau · 2 tiket menunggu");
    await userEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(onRetry).toHaveBeenCalledWith("kitchen");
  });

  it("stays out of the way while the stations print", async () => {
    render(<StationAlert db={db} onRetry={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves the receipt printer to the receipt's own message", async () => {
    await db.printJobs.add(failed("J1", "O1", "receipt"));
    render(<StationAlert db={db} onRetry={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
