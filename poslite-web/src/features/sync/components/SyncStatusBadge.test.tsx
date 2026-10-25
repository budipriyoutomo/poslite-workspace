import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SyncIndicator } from "../domain/sync-indicator";
import { SyncStatusBadge } from "./SyncStatusBadge";

function setup(indicator: SyncIndicator, counts = { pending: 0, dead: 0 }) {
  const onResend = vi.fn();
  render(<SyncStatusBadge indicator={indicator} {...counts} lastSyncAt="2026-10-25T09:55:00Z" onResend={onResend} />);
  return { onResend };
}

describe("SyncStatusBadge (15 · UX-01)", () => {
  it("shows a green synced badge with its age", () => {
    setup({ state: "synced", minutesAgo: 5 });
    const badge = screen.getByRole("button", { name: /Tersinkron/ });
    expect(badge).toHaveTextContent("Tersinkron · 5 mnt lalu");
    expect(badge).toHaveAttribute("data-tone", "ok");
  });

  it("says just now for a sync under a minute ago", () => {
    setup({ state: "synced", minutesAgo: 0 });
    expect(screen.getByRole("button", { name: /Tersinkron/ })).toHaveTextContent("Tersinkron · baru saja");
  });

  it("shows a yellow badge while sending", () => {
    setup({ state: "sending", pending: 3 });
    const badge = screen.getByRole("button", { name: /Mengirim/ });
    expect(badge).toHaveTextContent("Mengirim 3…");
    expect(badge).toHaveAttribute("data-tone", "wait");
  });

  it("shows a yellow offline badge with the waiting transactions", () => {
    setup({ state: "offline", pending: 2 });
    const badge = screen.getByRole("button", { name: /Offline/ });
    expect(badge).toHaveTextContent("Offline · 2 transaksi menunggu");
    expect(badge).toHaveAttribute("data-tone", "wait");
  });

  it("shows a red badge for failed transactions", () => {
    setup({ state: "failed", dead: 2 });
    const badge = screen.getByRole("button", { name: /gagal dikirim/ });
    expect(badge).toHaveTextContent("2 transaksi gagal dikirim");
    expect(badge).toHaveAttribute("data-tone", "error");
  });

  it("shows a red badge when the device has never synced its waiting transactions", () => {
    setup({ state: "stale", since: null });
    const badge = screen.getByRole("button", { name: /Belum pernah sync/ });
    expect(badge).toHaveAttribute("data-tone", "error");
  });

  it("shows a red badge with the time of the last sync when it is stale", () => {
    setup({ state: "stale", since: "2026-10-25T07:00:00Z" });
    expect(screen.getByRole("button", { name: /Belum sync sejak/ })).toHaveAttribute("data-tone", "error");
  });

  it("shows a plain DEMO badge on a demo device", () => {
    setup({ state: "demo" });
    expect(screen.getByText("DEMO")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens the details with the counts and a link to the Sync screen", async () => {
    setup({ state: "failed", dead: 2 }, { pending: 4, dead: 2 });
    await userEvent.click(screen.getByRole("button", { name: /gagal dikirim/ }));
    expect(screen.getByText("Menunggu dikirim").nextSibling).toHaveTextContent("4");
    expect(screen.getByText("Gagal dikirim").nextSibling).toHaveTextContent("2");
    expect(screen.getByRole("link", { name: "Buka layar Sync" })).toHaveAttribute("href", "/sync");
  });

  it("resends from the details", async () => {
    const { onResend } = setup({ state: "failed", dead: 2 }, { pending: 0, dead: 2 });
    await userEvent.click(screen.getByRole("button", { name: /gagal dikirim/ }));
    await userEvent.click(screen.getByRole("button", { name: "Kirim ulang" }));
    expect(onResend).toHaveBeenCalledOnce();
  });
});
