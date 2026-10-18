"use client";

import Link from "next/link";
import { useState } from "react";

import { formatDateTime } from "@/shared/format";
import { Pager } from "@/shared/ui/pager";
import { TableFrame } from "@/shared/ui/table-frame";

import { AUDIT_PAGE_SIZE, useAudit } from "../application/use-audit";
import { actionLabel, describeDetail } from "../domain/actions";

/** Operator actions, newest first; one tenant's when `tenantId` is given. */
export function AuditList({ tenantId }: { tenantId?: string }) {
  const [page, setPage] = useState(0);
  const audit = useAudit({ tenantId, page });
  const rows = audit.data?.rows ?? [];

  return (
    <div className="space-y-3">
      <TableFrame>
        <table aria-label="Audit log" className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Waktu</th>
              <th className="px-3 py-2 font-medium">Operator</th>
              <th className="px-3 py-2 font-medium">Aksi</th>
              {!tenantId && <th className="px-3 py-2 font-medium">Tenant</th>}
              <th className="px-3 py-2 font-medium">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                <td className="px-3 py-2">{e.operator_name}</td>
                <td className="px-3 py-2">{actionLabel(e.action)}</td>
                {!tenantId && (
                  <td className="px-3 py-2">
                    {e.tenant_id ? (
                      <Link className="text-blue-700 hover:underline" href={`/tenants/${e.tenant_id}`}>
                        {e.tenant_name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                <td className="px-3 py-2 text-muted-foreground">{describeDetail(e.detail)}</td>
              </tr>
            ))}
            {audit.isSuccess && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Belum ada aktivitas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>
      <Pager page={page} pageSize={AUDIT_PAGE_SIZE} total={audit.data?.total ?? 0} onPage={setPage} />
    </div>
  );
}
