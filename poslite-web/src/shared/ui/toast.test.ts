import { toast as sonner } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "./toast";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => vi.clearAllMocks());

describe("toast (15 · UX-07)", () => {
  it("shows a success for 2 seconds", () => {
    toast.success("Bill meja A1 disimpan");
    expect(sonner.success).toHaveBeenCalledWith("Bill meja A1 disimpan", expect.objectContaining({ duration: 2_000 }));
  });

  it("keeps an error until the cashier closes it", () => {
    toast.error("Printer dapur tidak terjangkau");
    expect(sonner.error).toHaveBeenCalledWith("Printer dapur tidak terjangkau", expect.objectContaining({ duration: Infinity, closeButton: true }));
  });

  it("lets a caller override the defaults", () => {
    toast.success("Struk dicetak", { duration: 5_000 });
    expect(sonner.success).toHaveBeenCalledWith("Struk dicetak", expect.objectContaining({ duration: 5_000 }));
  });
});
