"use client";

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

import { type Device, useDevices, useRevokeDevice } from "../application/use-outlet-admin";

const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
const seen = (iso: string | null) => (iso ? dateTime.format(new Date(iso)) : "—");

export function DevicesPanel({ outletId }: { outletId: string }) {
  const devices = useDevices(outletId);
  const revoke = useRevokeDevice(outletId);

  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">Perangkat kasir</h2>
      <p className="text-xs text-muted-foreground">Tablet diaktifkan dari aplikasi kasir dengan email & password manajer.</p>
      {devices.data?.length === 0 && <p className="text-sm text-muted-foreground">Belum ada perangkat.</p>}
      {devices.data && devices.data.length > 0 && (
        <div className="overflow-x-auto">
          <table aria-label="Perangkat" className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">Nama</th>
                <th className="py-2 font-medium">Kode</th>
                <th className="py-2 font-medium">Terakhir sinkron</th>
                <th className="py-2 font-medium">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {devices.data.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{d.name}</td>
                  <td className="py-2">{d.code}</td>
                  <td className="py-2 text-muted-foreground">{seen(d.last_seen_at)}</td>
                  <td className="py-2">{d.revoked_at ? <Badge variant="secondary">Dicabut</Badge> : <Badge>Aktif</Badge>}</td>
                  <td className="py-2 text-right">
                    {!d.revoked_at && <RevokeButton device={d} onConfirm={() => revoke.mutate(d.id, { onError: () => toast.error("Gagal mencabut perangkat") })} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RevokeButton({ device, onConfirm }: { device: Device; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Cabut ${device.name}`}>
          Cabut
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cabut akses {device.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Perangkat tidak bisa sinkron lagi dan harus diaktifkan ulang. Transaksi yang belum terkirim dari perangkat ini tidak akan masuk ke server.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Cabut akses</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
