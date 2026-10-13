// Roles over the company, a brand, or an outlet (ADR-022), as edited in the user form.

export type Role = "owner" | "manager" | "cashier";
export type ScopeType = "company" | "brand" | "outlet";

export interface Assignment {
  role: Role;
  scope_type: ScopeType;
  brand_id: string | null;
  outlet_id: string | null;
}

/** One line of the form: a role and a scope value ("company", "brand:<id>", "outlet:<id>"). */
export interface AssignmentRow {
  role: Role;
  scope: string;
}

interface Named {
  id: string;
  name: string;
}

interface OutletNamed extends Named {
  brand_id: string;
}

const ROLE_LABELS: Record<Role, string> = { owner: "Pemilik", manager: "Manajer", cashier: "Kasir" };
const COMPANY_LABEL = "Seluruh perusahaan";

export function scopeOptions(brands: Named[], outlets: OutletNamed[]): { value: string; label: string }[] {
  return [
    { value: "company", label: COMPANY_LABEL },
    ...brands.flatMap((b) => [
      { value: `brand:${b.id}`, label: `Brand ${b.name}` },
      ...outlets.filter((o) => o.brand_id === b.id).map((o) => ({ value: `outlet:${o.id}`, label: `Outlet ${b.name} · ${o.name}` })),
    ]),
  ];
}

/** The API fills an outlet scope's brand from the outlet. */
export function fromRow({ role, scope }: AssignmentRow): Assignment {
  const [kind, id = null] = scope.split(":");
  if (kind === "brand") return { role, scope_type: "brand", brand_id: id, outlet_id: null };
  if (kind === "outlet") return { role, scope_type: "outlet", brand_id: null, outlet_id: id };
  return { role, scope_type: "company", brand_id: null, outlet_id: null };
}

export function toRow(a: Assignment): AssignmentRow {
  if (a.scope_type === "brand") return { role: a.role, scope: `brand:${a.brand_id}` };
  if (a.scope_type === "outlet") return { role: a.role, scope: `outlet:${a.outlet_id}` };
  return { role: a.role, scope: "company" };
}

/** The server's scope rules, checked before saving; null = fine. */
export function problem({ role, scope }: AssignmentRow): string | null {
  if (role === "owner" && scope !== "company") return "Pemilik selalu untuk seluruh perusahaan";
  if (role === "cashier" && scope === "company") return "Kasir bekerja di brand atau outlet";
  return null;
}

export function describeAssignment(a: Assignment, brands: Named[], outlets: Named[]): string {
  const where =
    a.scope_type === "brand"
      ? `Brand ${brands.find((b) => b.id === a.brand_id)?.name ?? "—"}`
      : a.scope_type === "outlet"
        ? (outlets.find((o) => o.id === a.outlet_id)?.name ?? "—")
        : COMPANY_LABEL;
  return `${ROLE_LABELS[a.role]} · ${where}`;
}
