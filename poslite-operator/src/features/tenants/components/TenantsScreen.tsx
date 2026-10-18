"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { formatDate } from "@/shared/format";
import { Button } from "@/shared/ui/button";
import { selectClass } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Pager } from "@/shared/ui/pager";
import { TableFrame } from "@/shared/ui/table-frame";

import { PAGE_SIZE, type TenantStatus, useSetTenantStatus, useTenants } from "../application/use-tenants";
import { subscriptionLabel } from "../domain/labels";
import { SuspendButton } from "./SuspendButton";
import { TenantStatusBadge } from "./TenantStatusBadge";

export function TenantsScreen() {
  const [status, setStatus] = useState<TenantStatus | "">("");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const tenants = useTenants({ status: status || undefined, q: q || undefined, page });
  const setTenantStatus = useSetTenantStatus();
  const change = (id: string, next: TenantStatus) => setTenantStatus.mutate({ id, status: next }, { onError: () => toast.error("Gagal mengubah status") });
  const search = (e: FormEvent) => {
    e.preventDefault();
    setQ(draft.trim());
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Tenant</h1>
        <div className="flex flex-wrap items-center gap-3">
          <form role="search" onSubmit={search} className="flex w-full items-center gap-2 sm:w-auto">
            <Input
              type="search"
              aria-label="Cari tenant"
              placeholder="Nama, slug, atau email"
              className="w-full bg-card sm:w-64"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <Button type="submit" size="sm" variant="outline" aria-label="Cari">
              <Search />
            </Button>
          </form>
          <label className="flex items-center gap-2 text-sm">
            Status
            <select
              aria-label="Filter status"
              className={`${selectClass} w-40`}
              value={status}
              onChange={(e) => (setStatus(e.target.value as TenantStatus | ""), setPage(0))}
            >
              <option value="">Semua</option>
              <option value="active">Aktif</option>
              <option value="suspended">Ditangguhkan</option>
            </select>
          </label>
        </div>
      </div>
      <TableFrame>
        <table aria-label="Tenant" className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Nama</th>
              <th className="px-3 py-2 font-medium">Slug</th>
              <th className="px-3 py-2 text-right font-medium">Outlet</th>
              <th className="px-3 py-2 text-right font-medium">Perangkat</th>
              <th className="px-3 py-2 font-medium">Daftar</th>
              <th className="px-3 py-2 font-medium">Langganan</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tenants.data?.rows.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/tenants/${t.id}`} className="text-blue-700 hover:underline">
                    {t.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{t.slug}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.outlet_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.device_count}</td>
                <td className="px-3 py-2">{formatDate(t.created_at)}</td>
                <td className="px-3 py-2" aria-label="Langganan">
                  {subscriptionLabel(t.subscription_status)}
                </td>
                <td className="px-3 py-2" aria-label="Status">
                  <TenantStatusBadge status={t.status} reason={t.suspended_reason} />
                </td>
                <td className="px-3 py-2 text-right">
                  {t.status === "suspended" ? (
                    <Button size="sm" variant="outline" aria-label={`Aktifkan ${t.name}`} onClick={() => change(t.id, "active")}>
                      Aktifkan
                    </Button>
                  ) : (
                    <SuspendButton name={t.name} onConfirm={() => change(t.id, "suspended")} />
                  )}
                </td>
              </tr>
            ))}
            {tenants.isSuccess && tenants.data.rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  Tidak ada tenant yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableFrame>
      <Pager page={page} pageSize={PAGE_SIZE} total={tenants.data?.total ?? 0} onPage={setPage} />
    </div>
  );
}
