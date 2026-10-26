import { describe, expect, it } from "vitest";

import { denominationRows } from "./denominations";

describe("denominationRows (15 · UX-02)", () => {
  it("lists notes from the largest, with pieces and amount", () => {
    expect(denominationRows({ "20000": 1, "100000": 2 })).toEqual([
      { label: "Rp 100.000", pieces: 2, amount: 200_000 },
      { label: "Rp 20.000", pieces: 1, amount: 20_000 },
    ]);
  });

  it("shows coins last as a total, without pieces", () => {
    expect(denominationRows({ "1": 3_500, "50000": 1 })).toEqual([
      { label: "Rp 50.000", pieces: 1, amount: 50_000 },
      { label: "Koin", pieces: null, amount: 3_500 },
    ]);
  });

  it("leaves out denominations the cashier did not have", () => {
    expect(denominationRows({ "100000": 0, "10000": 3 })).toEqual([{ label: "Rp 10.000", pieces: 3, amount: 30_000 }]);
  });
});
