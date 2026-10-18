"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { AuditList } from "@/features/audit";
import { ApiError } from "@/shared/api";
import { formatDate, formatDateTime } from "@/shared/format";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { ConfirmButton } from "@/shared/ui/confirm-button";
import { TableFrame } from "@/shared/ui/table-frame";

import { type TenantDetail, useMarkInvoicePaid, useSetTenantStatus, useTenant } from "../application/use-tenants";
import { errorMessage, invoiceLabel, subscriptionLabel } from "../domain/labels";
import { ExtendTrialDialog } from "./ExtendTrialDialog";
import { SuspendButton } from "./SuspendButton";
import { TenantStatusBadge } from "./TenantStatusBadge";
import { TenantUsersTable } from "./TenantUsersTable";

const toastFailure = (error: unknown, fallback: string) => toast.error(errorMessage(error instanceof ApiError ? error.code : undefined, fallback));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function TenantDetailScreen({ tenantId }: { tenantId: string }) {
  const tenant = useTenant(tenantId);

  if (tenant.isError) {
    const missing = tenant.error instanceof ApiError && tenant.error.status === 404;
    return <p className="text-muted-foreground">{missing ? "Tenant tidak ditemukan." : "Gagal memuat tenant."}</p>;
  }
  if (!tenant.data) return null;
  return <Detail tenant={tenant.data} />;
}

function Detail({ tenant }: { tenant: TenantDetail }) {
  const setStatus = useSetTenantStatus();
  const markPaid = useMarkInvoicePaid();
  const sub = tenant.subscription;
  const change = (status: "active" | "suspended") => setStatus.mutate({ id: tenant.id, status }, { onError: (e) => toastFailure(e, "Gagal mengubah status") });

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link href="/tenants" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" /> Semua tenant
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
            <p className="text-sm text-muted-foreground">
              {tenant.slug} · daftar {formatDate(tenant.created_at)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <TenantStatusBadge status={tenant.status} reason={tenant.suspended_reason} />
            {tenant.status === "suspended" ? (
              <Button size="sm" variant="outline" onClick={() => change("active")}>
                Aktifkan
              </Button>
            ) : (
              <SuspendButton name={tenant.name} onConfirm={() => change("suspended")} />
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border bg-card p-4 text-sm">
          <dt className="text-muted-foreground">Owner</dt>
          <dd>
            {tenant.owners.length === 0
              ? "—"
              : tenant.owners.map((o) => (
                  <span key={`${o.name}-${o.email}`} className="block">
                    {o.name} · <span>{o.email ?? "tanpa email"}</span>
                  </span>
                ))}
          </dd>
          <dt className="text-muted-foreground">Outlet aktif</dt>
          <dd>{tenant.outlet_count}</dd>
          <dt className="text-muted-foreground">Perangkat aktif</dt>
          <dd>{tenant.device_count}</dd>
          {tenant.suspended_at && (
            <>
              <dt className="text-muted-foreground">Ditangguhkan</dt>
              <dd>{formatDateTime(tenant.suspended_at)}</dd>
            </>
          )}
        </dl>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg border bg-card p-4 text-sm">
          <dt className="text-muted-foreground">Langganan</dt>
          <dd aria-label="Status langganan">{sub ? subscriptionLabel(sub.status) : "Belum dimulai (job billing belum jalan)"}</dd>
          <dt className="text-muted-foreground">Akhir trial</dt>
          <dd>{sub ? formatDate(sub.trial_ends_at) : "—"}</dd>
          <dt className="text-muted-foreground">Periode dibayar s.d.</dt>
          <dd>{sub?.current_period_end ? formatDate(sub.current_period_end) : "—"}</dd>
          {(!sub || sub.status === "trialing") && (
            <dd className="col-span-2">
              <ExtendTrialDialog tenantId={tenant.id} />
            </dd>
          )}
        </dl>
      </div>

      <Section title="Tagihan">
        <TableFrame>
          <table aria-label="Tagihan" className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Periode</th>
                <th className="px-3 py-2 text-right font-medium">Outlet</th>
                <th className="px-3 py-2 text-right font-medium">Jumlah</th>
                <th className="px-3 py-2 font-medium">Jatuh tempo</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tenant.invoices.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    {formatDate(i.period_start)} – {formatDate(i.period_end)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{i.outlet_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(i.amount)}</td>
                  <td className="px-3 py-2">{formatDate(i.due_at)}</td>
                  <td className="px-3 py-2">{i.paid_at ? `${invoiceLabel(i.status)} · ${formatDate(i.paid_at)}` : invoiceLabel(i.status)}</td>
                  <td className="px-3 py-2 text-right">
                    {i.status === "open" && (
                      <ConfirmButton
                        label={`Tandai lunas ${i.period_start}`}
                        title="Tandai tagihan lunas?"
                        description={`Pakai ini bila ${formatRupiah(i.amount)} sudah diterima di luar payment gateway (mis. transfer bank). Bila tenant ditangguhkan karena tagihan, ia langsung aktif lagi.`}
                        confirm="Tandai lunas"
                        onConfirm={() => markPaid.mutate(i.id, { onSuccess: () => toast.success("Tagihan ditandai lunas"), onError: (e) => toastFailure(e, "Gagal menandai lunas") })}
                      >
                        Tandai lunas
                      </ConfirmButton>
                    )}
                  </td>
                </tr>
              ))}
              {tenant.invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Belum ada tagihan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableFrame>
      </Section>

      <Section title="Pengguna">
        <TenantUsersTable tenantId={tenant.id} users={tenant.users} />
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Outlet">
          <TableFrame>
            <table aria-label="Outlet" className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Kode</th>
                  <th className="px-3 py-2 font-medium">Nama</th>
                  <th className="px-3 py-2 font-medium">Brand</th>
                  <th className="px-3 py-2 text-right font-medium">Perangkat</th>
                </tr>
              </thead>
              <tbody>
                {tenant.outlets.map((o) => (
                  <tr key={o.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono">{o.code}</td>
                    <td className="px-3 py-2">{o.name}</td>
                    <td className="px-3 py-2">{o.brand_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{o.device_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableFrame>
        </Section>
        <Section title="Perangkat">
          <TableFrame>
            <table aria-label="Perangkat" className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Nama</th>
                  <th className="px-3 py-2 font-medium">Outlet</th>
                  <th className="px-3 py-2 font-medium">Versi</th>
                  <th className="px-3 py-2 font-medium">Terakhir online</th>
                </tr>
              </thead>
              <tbody>
                {tenant.devices.map((d) => (
                  <tr key={d.id} className={d.revoked_at ? "border-b text-muted-foreground line-through last:border-0" : "border-b last:border-0"}>
                    <td className="px-3 py-2">
                      {d.name} <span className="text-xs text-muted-foreground">{d.platform}</span>
                    </td>
                    <td className="px-3 py-2">{d.outlet_name}</td>
                    <td className="px-3 py-2">{d.app_version ?? "—"}</td>
                    <td className="px-3 py-2">{d.last_seen_at ? formatDateTime(d.last_seen_at) : "—"}</td>
                  </tr>
                ))}
                {tenant.devices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      Belum ada perangkat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableFrame>
        </Section>
      </div>

      <Section title="Aktivitas operator">
        <AuditList tenantId={tenant.id} />
      </Section>
    </div>
  );
}
