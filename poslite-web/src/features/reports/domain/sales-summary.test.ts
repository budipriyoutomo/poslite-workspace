import { describe, expect, it } from "vitest";

import { type SalesOrder, summarizeSales } from "./sales-summary";

const order = (o: Partial<SalesOrder> & Pick<SalesOrder, "total">): SalesOrder => ({
  status: "paid",
  discountAmount: 0,
  serviceCharge: 0,
  tax: 0,
  lines: [],
  payments: [],
  changeAmount: 0,
  ...o,
});

describe("summarizeSales", () => {
  const orders: SalesOrder[] = [
    order({
      total: 72_765,
      discountAmount: 7_000,
      serviceCharge: 3_150,
      tax: 6_615,
      changeAmount: 27_235,
      lines: [{ productName: "Nasi Gudeg", categoryName: "Makanan", quantity: 2, lineTotal: 70_000 }],
      payments: [{ methodName: "Tunai", methodType: "cash", amount: 100_000 }],
    }),
    order({
      total: 11_000,
      lines: [
        { productName: "Es Teh Manis", categoryName: "Minuman", quantity: 1, lineTotal: 5_000 },
        { productName: "Kopi Tubruk", categoryName: "Minuman", quantity: 1, lineTotal: 6_000 },
      ],
      payments: [{ methodName: "QRIS", methodType: "qris", amount: 11_000 }],
    }),
    order({ status: "voided", total: 99_999, lines: [{ productName: "Nasi Gudeg", categoryName: "Makanan", quantity: 9, lineTotal: 99_999 }], payments: [{ methodName: "Tunai", methodType: "cash", amount: 99_999 }] }),
  ];

  it("totals revenue, transactions, discount, service and PB1 of paid orders", () => {
    expect(summarizeSales(orders)).toMatchObject({ revenue: 83_765, transactions: 2, voided: 1, discount: 7_000, service: 3_150, tax: 6_615 });
  });

  it("counts payment methods net of change", () => {
    expect(summarizeSales(orders).byPaymentMethod).toEqual([
      { name: "Tunai", amount: 72_765, count: 1 },
      { name: "QRIS", amount: 11_000, count: 1 },
    ]);
  });

  it("ranks categories and products by sales before order discount", () => {
    const summary = summarizeSales(orders);
    expect(summary.byCategory).toEqual([
      { name: "Makanan", quantity: 2, amount: 70_000 },
      { name: "Minuman", quantity: 2, amount: 11_000 },
    ]);
    expect(summary.byProduct.map((p) => p.name)).toEqual(["Nasi Gudeg", "Kopi Tubruk", "Es Teh Manis"]);
  });

  it("is all zeros with no orders", () => {
    expect(summarizeSales([])).toMatchObject({ revenue: 0, transactions: 0, byPaymentMethod: [], byProduct: [] });
  });
});
