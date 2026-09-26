import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { useCart } from "@/features/cart";

import { OrderSummary } from "./OrderSummary";

const gudeg = { productId: "P1", name: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, note: "", modifiers: [{ optionId: "M1", groupId: "G1", name: "Tambah Ayam", price: 10_000 }] };
const rates = { serviceBps: 500, taxBps: 1_000 };

beforeEach(() => {
  useCart.getState().clear();
  useCart.getState().add(gudeg);
  useCart.getState().add(gudeg);
});

/** The <dd> that follows the <dt> with this label. */
const row = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;

describe("OrderSummary", () => {
  it("shows subtotal, service, PB1 and total from the outlet rates", () => {
    render(<OrderSummary rates={rates} />);
    expect(row("Subtotal")).toHaveTextContent("Rp 70.000");
    expect(row("Service 5%")).toHaveTextContent("Rp 3.500");
    expect(row("PB1 10%")).toHaveTextContent("Rp 7.350");
    expect(row("Total")).toHaveTextContent("Rp 80.850");
  });

  it("hides service and PB1 when the outlet does not charge them", () => {
    render(<OrderSummary rates={{ serviceBps: 0, taxBps: 0 }} />);
    expect(screen.queryByText(/Service|PB1/)).not.toBeInTheDocument();
  });

  it("applies and removes a preset discount", async () => {
    render(<OrderSummary rates={rates} />);
    await userEvent.click(screen.getByRole("button", { name: "Diskon" }));
    await userEvent.click(screen.getByRole("button", { name: "10%" }));
    expect(row("Diskon 10%")).toHaveTextContent("-Rp 7.000");
    expect(row("Total")).toHaveTextContent("Rp 72.765");
    await userEvent.click(screen.getByRole("button", { name: "Hapus diskon" }));
    expect(row("Total")).toHaveTextContent("Rp 80.850");
  });

  it("shows item discounts apart from the order discount taken on what is left", async () => {
    const key = useCart.getState().lines[0]!.key;
    useCart.getState().setLineDiscount(key, { type: "fixed", value: 5_000 });
    useCart.getState().setDiscount({ type: "percentage", value: 10 });
    render(<OrderSummary rates={{ serviceBps: 0, taxBps: 0 }} />);

    expect(row("Diskon item")).toHaveTextContent("-Rp 5.000");
    expect(row("Diskon 10%")).toHaveTextContent("-Rp 6.500");
    expect(row("Total")).toHaveTextContent("Rp 58.500");
  });
});
