import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { getDb } from "@/shared/db";

import { SyncStatus } from "./SyncStatus";

const DEVICE = { mode: "server" as const, deviceId: "01K5ZD00000000000000000001", deviceCode: "A", outletId: "01K5ZT00000000000000000001", token: "tok" };
const deadEvent = { id: "01K5ZE00000000000000000001", type: "shift.opened" as const, aggregateId: "01K5ZS00000000000000000001", occurredAt: "", payload: {}, status: "dead" as const, attempts: 5, createdAt: "" };

beforeEach(async () => {
  const db = getDb();
  await Promise.all([db.syncState.clear(), db.outbox.clear()]);
});

describe("SyncStatus (15 · UX-01)", () => {
  it("shows DEMO on a demo device", async () => {
    await getDb().syncState.put({ key: "device", value: { mode: "demo" } });
    render(<SyncStatus isOnline />);
    expect(await screen.findByText("DEMO")).toBeInTheDocument();
  });

  it("shows synced on a server device with an empty outbox", async () => {
    await getDb().syncState.put({ key: "device", value: DEVICE });
    await getDb().syncState.put({ key: "lastSyncAt", value: new Date().toISOString() });
    render(<SyncStatus isOnline />);
    expect(await screen.findByRole("button", { name: "Tersinkron · baru saja" })).toBeInTheDocument();
  });

  it("puts dead events back in the queue on Kirim ulang", async () => {
    await getDb().syncState.put({ key: "device", value: DEVICE });
    await getDb().outbox.add(deadEvent);
    render(<SyncStatus isOnline />);

    await userEvent.click(await screen.findByRole("button", { name: "1 transaksi gagal dikirim" }));
    await userEvent.click(screen.getByRole("button", { name: "Kirim ulang" }));

    await waitFor(async () => expect((await getDb().outbox.toArray()).map((e) => e.status)).toEqual(["pending"]));
  });
});
