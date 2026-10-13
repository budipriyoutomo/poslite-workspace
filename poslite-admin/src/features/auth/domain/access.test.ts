import { describe, expect, it } from "vitest";

import { type AccessTree, activeBrand, pageAccess } from "./access";

const tree = (company: boolean, brands: AccessTree["brands"]): AccessTree => ({ tenant: { id: "T", name: "PT Rasa", status: "active" }, company_scope: company, brands });
const SUSHI = { id: "B2", code: "SUSHI", name: "Sushi", role: "manager" as const, outlets: [] };
const OUTLET_ONLY = { id: "B1", code: "RASA", name: "Rasa", role: null, outlets: [{ id: "O1", code: "JKT01", name: "Kemang", role: "manager" as const }] };

describe("pageAccess (ADR-022)", () => {
  it("lets a company-wide user open company pages and manage every brand", () => {
    expect(pageAccess(tree(true, [{ ...SUSHI, role: "owner" }]), "B2")).toEqual({ company: true, manageBrand: true });
  });

  it("lets a brand manager manage only the active brand", () => {
    expect(pageAccess(tree(false, [SUSHI]), "B2")).toEqual({ company: false, manageBrand: true });
  });

  it("gives an outlet manager neither company pages nor brand management", () => {
    expect(pageAccess(tree(false, [OUTLET_ONLY]), "B1")).toEqual({ company: false, manageBrand: false });
  });

  it("grants nothing while the access tree is loading", () => {
    expect(pageAccess(undefined, "B1")).toEqual({ company: false, manageBrand: false });
  });
});

describe("activeBrand", () => {
  it("is the chosen brand when the user may still see it, else the first one", () => {
    const access = tree(false, [OUTLET_ONLY, SUSHI]);
    expect(activeBrand(access, "B2")?.id).toBe("B2");
    expect(activeBrand(access, "GONE")?.id).toBe("B1");
    expect(activeBrand(tree(false, []), null)).toBeNull();
  });
});
