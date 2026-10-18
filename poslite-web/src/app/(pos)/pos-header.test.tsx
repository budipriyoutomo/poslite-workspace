import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PosHeader } from "./pos-header";

const renderHeader = (isOnline: boolean, onLock = vi.fn()) => render(<PosHeader cashierName="Siti" isOnline={isOnline} onLock={onLock} />);

describe("PosHeader", () => {
  it("warns the cashier while offline", () => {
    renderHeader(false);
    expect(screen.getByText("Offline", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("tersimpan di perangkat");
  });

  it("shows no offline banner while online", () => {
    renderHeader(true);
    expect(screen.getByText("Online", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("locks the POS", async () => {
    const onLock = vi.fn();
    renderHeader(true, onLock);
    await userEvent.click(screen.getByRole("button", { name: "Kunci" }));
    expect(onLock).toHaveBeenCalledOnce();
  });
});
