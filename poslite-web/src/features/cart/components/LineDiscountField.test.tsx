import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { useCart } from "../application/cart-store";
import { LineDiscountField } from "./LineDiscountField";

const gudeg = { productId: "P1", name: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, note: "", modifiers: [] };

beforeEach(() => useCart.getState().clear());

describe("LineDiscountField (15 · UX-06)", () => {
  it("gives the line being edited a manual discount and removes it", async () => {
    useCart.getState().add(gudeg);
    const key = useCart.getState().lines[0]!.key;
    render(<LineDiscountField lineKey={key} />);

    await userEvent.click(screen.getByRole("button", { name: "Diskon item Nasi Gudeg" }));
    await userEvent.click(await screen.findByRole("button", { name: "10%" }));
    expect(useCart.getState().lines[0]!.discount).toEqual({ type: "percentage", value: 10 });

    await userEvent.click(screen.getByRole("button", { name: "Hapus diskon Nasi Gudeg" }));
    expect(useCart.getState().lines[0]!.discount).toBeNull();
  });
});
