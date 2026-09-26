"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { selectClass } from "@/shared/ui/form-field";

import { type Tenant, type TenantStatus, useSetTenantStatus, useTenants } from "../application/use-platform";

const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
const SUBSCRIPTION: Record<string, string> = { trialing: "Masa coba", active: "Aktif", past_due: "Menunggak" };

export function TenantsScreen() {
  const [status, setStatus] = useState<TenantStatus | "">("");
  const tenants = useTenants(status || undefined);
  const setTenantStatus = useSetTenantStatus();
  const change = (id: string, next: TenantStatus) => setTenantStatus.mutate({ id, status: next }, { onError: () => toast.error("Gagal mengubah status") });

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">Tenant</h1>
        <label className="flex items-center gap-2 text-sm">
          Status
          <select aria-label="Filter status" className={`${selectClass} w-44`} value={status} onChange={(e) => setStatus(e.target.value as TenantStatus | "")}>
            <option value="">Semua</option>
            <option value="active">Aktif</option>
            <option value="suspended">Ditangguhkan</option>
          </select>
        </label>
      </div>
      <table aria-label="Tenant" className="w-full rounded-lg border bg-white text-sm">
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
          {tenants.data?.map((t) => (
            <tr key={t.id} className="border-b last:border-0">
              <td className="px-3 py-2 font-medium">{t.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{t.slug}</td>
              <td className="px-3 py-2 text-right tabular-nums">{t.outlet_count}</td>
              <td className="px-3 py-2 text-right tabular-nums">{t.device_count}</td>
              <td className="px-3 py-2">{date.format(new Date(t.created_at))}</td>
              <td className="px-3 py-2" aria-label="Langganan">
                {SUBSCRIPTION[t.subscription_status ?? ""] ?? "—"}
              </td>
              <td className="px-3 py-2" aria-label="Status">
                {t.status === "suspended" ? (
                  <Badge variant="destructive">{t.suspended_reason === "billing" ? "Ditangguhkan · tagihan" : "Ditangguhkan"}</Badge>
                ) : (
                  <Badge>Aktif</Badge>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                {t.status === "suspended" ? (
                  <Button size="sm" variant="outline" aria-label={`Aktifkan ${t.name}`} onClick={() => change(t.id, "active")}>
                    Aktifkan
                  </Button>
                ) : (
                  <SuspendButton tenant={t} onConfirm={() => change(t.id, "suspended")} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SuspendButton({ tenant, onConfirm }: { tenant: Tenant; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" aria-label={`Tangguhkan ${tenant.name}`}>
          Tangguhkan
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tangguhkan {tenant.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Pemilik tidak bisa mengubah data di back-office. Kasir tetap bisa berjualan dan transaksi tetap tersinkron, jadi tidak ada data yang hilang.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Tangguhkan</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
