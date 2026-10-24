type Role = "owner" | "manager" | "cashier" | "waiter";

/** GET /me/access: the brands and outlets this user may pick (ADR-022). Mirrors the API schema
 * (domain stays free of the generated client). */
export interface AccessBrand {
  id: string;
  code: string;
  name: string;
  /** Role over the whole brand; null = only some of its outlets. */
  role: Role | null;
  outlets: { id: string; code: string; name: string; role: Role }[];
}

export interface AccessTree {
  tenant: { id: string; name: string; status: string };
  company_scope: boolean;
  brands: AccessBrand[];
}

/** Which back-office pages make sense for the user, with `brandId` as the active brand. */
export function pageAccess(access: AccessTree | undefined, brandId: string | null): { company: boolean; manageBrand: boolean } {
  if (!access) return { company: false, manageBrand: false };
  const brand = access.brands.find((b) => b.id === brandId);
  return { company: access.company_scope, manageBrand: access.company_scope || (brand?.role ?? null) !== null };
}

/** The chosen brand while the user may still see it, otherwise their first brand. */
export function activeBrand(access: AccessTree, brandId: string | null): AccessBrand | null {
  return access.brands.find((b) => b.id === brandId) ?? access.brands[0] ?? null;
}
