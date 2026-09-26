import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { useCart } from "../application/cart-store";
import { CartLines } from "./CartLines";

const gudeg = { productId: "P1", name: "Nasi Gudeg", categoryName: "Makanan", unitPrice: 25_000, note: "tidak pedas", modifiers: [{ optionId: "M1", groupId: "G1", name: "Tambah Ayam", price: 10_000 }] };

beforeEach(() => useCart.getState().clear());

describe("CartLines", () => {
  it("shows an empty state", () => {
    render(<CartLines onEdit={() => undefined} />);
    expect(screen.getByText("Keranjang kosong")).toBeInTheDocument();
  });

  it("shows each line with its modifiers, note and line total", () => {
    useCart.getState().add(gudeg);
    useCart.getState().add(gudeg);
    render(<CartLines onEdit={() => undefined} />);
    const line = screen.getByRole("listitem");
    expect(line).toHaveTextContent("Nasi Gudeg");
    expect(line).toHaveTextContent("+ Tambah Ayam");
    expect(line).toHaveTextContent("tidak pedas");
    expect(within(line).getByText("Rp 70.000")).toBeInTheDocument();
  });

  it("changes the quantity and removes the line at zero", async () => {
    useCart.getState().add(gudeg);
    render(<CartLines onEdit={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "Tambah jumlah Nasi Gudeg" }));
    expect(screen.getByLabelText("Jumlah Nasi Gudeg")).toHaveTextContent("2");
    await userEvent.click(screen.getByRole("button", { name: "Kurangi jumlah Nasi Gudeg" }));
    await userEvent.click(screen.getByRole("button", { name: "Kurangi jumlah Nasi Gudeg" }));
    expect(screen.getByText("Keranjang kosong")).toBeInTheDocument();
  });

  it("shows the promotion or discount given to a line", () => {
    useCart.getState().add(gudeg);
    render(<CartLines onEdit={() => undefined} applied={[{ label: "Happy hour", amount: 7_000 }]} />);

    expect(within(screen.getByRole("listitem")).getByText("Happy hour")).toBeInTheDocument();
    expect(within(screen.getByRole("listitem")).getByText("-Rp 7.000")).toBeInTheDocument();
  });

  it("gives one line a manual discount and removes it", async () => {
    useCart.getState().add(gudeg);
    render(<CartLines onEdit={() => undefined} />);

    await userEvent.click(screen.getByRole("button", { name: "Diskon item Nasi Gudeg" }));
    await userEvent.click(await screen.findByRole("button", { name: "10%" }));
    expect(useCart.getState().lines[0]!.discount).toEqual({ type: "percentage", value: 10 });

    await userEvent.click(screen.getByRole("button", { name: "Hapus diskon Nasi Gudeg" }));
    expect(useCart.getState().lines[0]!.discount).toBeNull();
  });
});
