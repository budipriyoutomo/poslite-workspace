import { describe, expect, it } from "vitest";

import { describeAssignment, fromRow, problem, scopeOptions, toRow } from "./assignments";

const BRANDS = [
  { id: "B1", name: "Maharasa" },
  { id: "B2", name: "Sushi" },
];
const OUTLETS = [
  { id: "O1", name: "Kemang", brand_id: "B1" },
  { id: "O2", name: "Dago", brand_id: "B2" },
];

describe("scopeOptions (ADR-022)", () => {
  it("offers the company, each brand, and each outlet under its brand", () => {
    expect(scopeOptions(BRANDS, OUTLETS)).toEqual([
      { value: "company", label: "Seluruh perusahaan" },
      { value: "brand:B1", label: "Brand Maharasa" },
      { value: "outlet:O1", label: "Outlet Maharasa · Kemang" },
      { value: "brand:B2", label: "Brand Sushi" },
      { value: "outlet:O2", label: "Outlet Sushi · Dago" },
    ]);
  });
});

describe("form rows ↔ API assignments", () => {
  it("round-trips every scope", () => {
    const rows = [
      { role: "owner" as const, scope: "company" },
      { role: "manager" as const, scope: "brand:B2" },
      { role: "cashier" as const, scope: "outlet:O1" },
    ];
    const assignments = rows.map(fromRow);

    expect(assignments).toEqual([
      { role: "owner", scope_type: "company", brand_id: null, outlet_id: null },
      { role: "manager", scope_type: "brand", brand_id: "B2", outlet_id: null },
      { role: "cashier", scope_type: "outlet", brand_id: null, outlet_id: "O1" },
    ]);
    expect(assignments.map(toRow)).toEqual(rows);
  });
});

describe("problem", () => {
  it("follows the server's scope rules", () => {
    expect(problem({ role: "owner", scope: "brand:B1" })).toBe("Pemilik selalu untuk seluruh perusahaan");
    expect(problem({ role: "cashier", scope: "company" })).toBe("Kasir bekerja di brand atau outlet");
    expect(problem({ role: "waiter", scope: "company" })).toBe("Pelayan bekerja di brand atau outlet");
    expect(problem({ role: "manager", scope: "company" })).toBeNull();
  });
});

describe("describeAssignment", () => {
  it("names the role and where it applies", () => {
    expect(describeAssignment({ role: "manager", scope_type: "brand", brand_id: "B2", outlet_id: null }, BRANDS, OUTLETS)).toBe("Manajer · Brand Sushi");
    expect(describeAssignment({ role: "cashier", scope_type: "outlet", brand_id: "B1", outlet_id: "O1" }, BRANDS, OUTLETS)).toBe("Kasir · Kemang");
    expect(describeAssignment({ role: "owner", scope_type: "company", brand_id: null, outlet_id: null }, BRANDS, OUTLETS)).toBe("Pemilik · Seluruh perusahaan");
  });
});
