import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Pairing } from "./pairing.ts";

// P1-5: the POS asks for a 6-digit code shown on the PC instead of a long token typed by hand.
const clock = (start = 0) => {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
};
const digits = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe("Pairing", () => {
  it("shows a 6-digit code that pairs once, then a new one", () => {
    const pairing = new Pairing({ now: clock().now, randomCode: digits(123456, 654321) });

    assert.equal(pairing.current().code, "123456");
    assert.equal(pairing.redeem("123456"), "paired");
    assert.equal(pairing.current().code, "654321");
    assert.equal(pairing.redeem("123456"), "wrong");
  });

  it("keeps leading zeros", () => {
    assert.equal(new Pairing({ now: clock().now, randomCode: digits(42) }).current().code, "000042");
  });

  it("changes the code every 5 minutes", () => {
    const time = clock();
    const pairing = new Pairing({ now: time.now, randomCode: digits(111111, 222222) });
    pairing.current();

    time.advance(5 * 60_000);

    assert.equal(pairing.current().code, "222222");
    assert.equal(pairing.redeem("111111"), "wrong");
  });

  it("locks for 5 minutes after 5 wrong codes", () => {
    const time = clock();
    const pairing = new Pairing({ now: time.now, randomCode: digits(123456) });
    for (let i = 0; i < 5; i++) pairing.redeem("000000");

    assert.equal(pairing.redeem("123456"), "locked");
    time.advance(5 * 60_000);
    assert.equal(pairing.redeem(pairing.current().code), "paired");
  });
});
