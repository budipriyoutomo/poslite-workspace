import { describe, expect, it, vi } from "vitest";

import { orderLookup } from "./order-lookup";

const DETAIL = {
  id: "01K5ZR00000000000000000001",
  receipt_no: "JKT01A-260925-0001",
  status: "paid",
  total: 72_765,
  discount_amount: 7_000,
  lines: [{ id: "01K5ZN00000000000000000001", product_name: "Nasi Gudeg", quantity: 2, line_total: 70_000, discount_amount: 0, refunded_quantity: 1, extra: "ignored" }],
  payments: [{ payment_method_id: "01K5ZY00000000000000000001", method_type: "cash", amount: 100_000 }],
};

const api = (status: number, body: unknown) => ({
  baseUrl: "http://api.test/api/v1",
  appVersion: "0.1.0",
  token: "tok",
  deviceId: "D1",
  fetch: vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })),
});

describe("orderLookup (ADR-023)", () => {
  it("turns an order of the outlet into a refund source with what other devices refunded", async () => {
    const config = api(200, { data: DETAIL, message: "OK", meta: {} });

    const found = await orderLookup(config)("JKT01A-260925-0001");

    expect(found).toEqual({
      source: {
        orderId: DETAIL.id,
        receiptNo: DETAIL.receipt_no,
        total: 72_765,
        discountAmount: 7_000,
        lines: [{ id: DETAIL.lines[0]!.id, productName: "Nasi Gudeg", quantity: 2, gross: 70_000, lineDiscount: 0, refunded: 1 }],
      },
      status: "paid",
      paymentMethodIds: ["01K5ZY00000000000000000001"],
    });
    expect(String(config.fetch.mock.calls[0]![0])).toBe("http://api.test/api/v1/orders/lookup?receipt_no=JKT01A-260925-0001");
  });

  it("answers null for a receipt number the outlet does not have", async () => {
    const found = await orderLookup(api(404, { message: "Order not found", code: "ORDER_NOT_FOUND" }))("X");

    expect(found).toBeNull();
  });
});
