import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithApi } from "../../../../tests/support/render";
import { AuditList } from "./AuditList";

const ENTRY = {
  id: "01K5ZW00000000000000000001",
  action: "user.reset_password",
  operator_id: "01K5ZX00000000000000000001",
  operator_name: "Ops",
  tenant_id: "01K5ZT00000000000000000001",
  tenant_name: "Kopi Senja",
  target_id: "01K5ZU00000000000000000001",
  detail: { name: "Tini" },
  created_at: "2026-10-12T02:30:00Z",
};

const reply = (rows: unknown[]) => ({ body: { data: rows, message: "OK", meta: { total: rows.length, limit: 20, offset: 0 } } });

describe("AuditList", () => {
  it("lists operator actions with the tenant", async () => {
    const { calls } = renderWithApi(<AuditList />, () => reply([ENTRY]));

    const row = within((await screen.findByText("Reset password user")).closest("tr")!);
    expect(row.getByText("Ops")).toBeInTheDocument();
    expect(row.getByText("Tini")).toBeInTheDocument();
    expect(row.getByRole("link", { name: "Kopi Senja" })).toHaveAttribute("href", `/tenants/${ENTRY.tenant_id}`);
    expect(calls[0]?.path).toBe("/api/v1/platform/audit?limit=20&offset=0");
  });

  it("shows one tenant's actions without the tenant column", async () => {
    const { calls } = renderWithApi(<AuditList tenantId={ENTRY.tenant_id} />, () => reply([ENTRY]));

    await screen.findByText("Reset password user");
    expect(screen.queryByRole("link", { name: "Kopi Senja" })).not.toBeInTheDocument();
    expect(calls[0]?.path).toBe(`/api/v1/platform/audit?tenant_id=${ENTRY.tenant_id}&limit=20&offset=0`);
  });

  it("says when nothing happened yet", async () => {
    renderWithApi(<AuditList />, () => reply([]));

    expect(await screen.findByText("Belum ada aktivitas.")).toBeInTheDocument();
  });
});
