import { describe, expect, it } from "vitest";

import billVoids from "../../../../tests/fixtures/bill-void-events.json";
import corrections from "../../../../tests/fixtures/correction-events.json";
import orderVariants from "../../../../tests/fixtures/order-placed-variants.json";
import events from "../../../../tests/fixtures/sync-events.json";
import { billItemVoided, eventPayloads, orderPlaced } from "./event-payloads";

// Same file as poslite-api's push payload tests: device and server agree on every event shape.
describe("push payload contract (shared fixture)", () => {
  it.each([...events, ...corrections, ...billVoids])("$type is valid", ({ type, payload }) => {
    expect(eventPayloads[type as keyof typeof eventPayloads].safeParse(payload).success).toBe(true);
  });
});

describe("order.placed variants (shared fixture)", () => {
  it.each(orderVariants)("$name", ({ payload }) => {
    expect(orderPlaced.safeParse(payload).success).toBe(true);
  });
});

describe("order.placed limits", () => {
  it("rejects a payment reference longer than the server column (64)", () => {
    const { payload } = events.find((e) => e.type === "order.placed")!;
    const payments = (payload as { payments: object[] }).payments.map((p) => ({ ...p, reference: "R".repeat(65) }));
    expect(orderPlaced.safeParse({ ...payload, payments }).success).toBe(false);
  });
});

describe("bill.item_voided limits", () => {
  const { payload } = billVoids[0]!;

  it("needs at least one line", () => {
    expect(billItemVoided.safeParse({ ...payload, lines: [] }).success).toBe(false);
  });

  it("rejects a line amount that is not unit price × quantity", () => {
    const lines = payload.lines.map((l) => ({ ...l, amount: l.amount + 1 }));
    expect(billItemVoided.safeParse({ ...payload, lines }).success).toBe(false);
  });
});
