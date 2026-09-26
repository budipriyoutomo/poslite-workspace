import { describe, expect, it } from "vitest";

import events from "../../../../tests/fixtures/sync-events.json";
import { eventPayloads } from "./event-payloads";

// Same file as poslite-api's push payload tests: device and server agree on every event shape.
describe("push payload contract (shared fixture)", () => {
  it.each(events)("$type is valid", ({ type, payload }) => {
    expect(eventPayloads[type as keyof typeof eventPayloads].safeParse(payload).success).toBe(true);
  });
});
