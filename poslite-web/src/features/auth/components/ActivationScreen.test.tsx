import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActivationScreen } from "./ActivationScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

describe("ActivationScreen demo entry (15 · UX-01)", () => {
  it("offers the demo where the deployment enables it", () => {
    render(<ActivationScreen isDemoEnabled />);
    expect(screen.getByRole("button", { name: "Coba mode demo (tanpa server)" })).toBeInTheDocument();
  });

  it("hides the demo on a tenant deployment", () => {
    render(<ActivationScreen isDemoEnabled={false} />);
    expect(screen.queryByRole("button", { name: /mode demo/ })).not.toBeInTheDocument();
  });
});
