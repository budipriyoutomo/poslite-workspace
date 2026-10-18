"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { RefreshCw, Send } from "lucide-react";

import { verifyPin } from "@/features/auth";
import { getDb } from "@/shared/db";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

import { buildDeviceExport } from "../application/device-export";
import { resendDead } from "../application/sync-engine";
import { kickSync } from "../application/sync-runner";
import { useDeadEvents, useSyncStatus } from "../application/use-sync-status";
import { EmergencyExport } from "./EmergencyExport";

/** A manager's PIN, checked offline like the lock screen. */
async function isManagerPin(userId: string, pin: string): Promise<boolean> {
  try {
    return (await verifyPin({ userId, pin })).role !== "cashier";
  } catch {
    return false;
  }
}

const TYPE_LABEL: Record<string, string> = {
  "order.placed": "Penjualan",
  "shift.opened": "Buka shift",
  "shift.closed": "Tutup shift",
  "cash.moved": "Kas masuk/keluar",
  "order.voided": "Void",
  "order.refunded": "Refund",
};

export function SyncScreen() {
  const status = useSyncStatus();
  const dead = useDeadEvents();
  const managers = useLiveQuery(async () => (await getDb().users.toArray()).filter((u) => u.role !== "cashier").map((u) => ({ id: u.id, name: u.name })), []) ?? [];
  if (!status) return null;
  if (status.mode !== "server") return <p className="p-6 text-muted-foreground">Mode demo: data tidak dikirim ke server.</p>;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle>Sinkronisasi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-1">
            <dt className="text-muted-foreground">Menunggu dikirim</dt>
            <dd className="text-right font-semibold">{status.pending}</dd>
            <dt className="text-muted-foreground">Gagal (perlu tindakan)</dt>
            <dd className="text-right font-semibold text-destructive">{status.dead}</dd>
            <dt className="text-muted-foreground">Terakhir sinkron</dt>
            <dd className="text-right">{status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString("id-ID") : "—"}</dd>
          </dl>
          {status.lastError && <p className="rounded bg-warning/10 p-2 text-warning">Terakhir gagal: {status.lastError}</p>}
          <Button onClick={kickSync} disabled={status.isSyncing}>
            <RefreshCw className={status.isSyncing ? "animate-spin" : undefined} /> Sync sekarang
          </Button>
        </CardContent>
      </Card>
      {dead && dead.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ditolak server</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y text-sm">
              {dead.map((e) => (
                <li key={e.id} className="py-2">
                  <p className="font-medium">
                    {TYPE_LABEL[e.type] ?? e.type} · {new Date(e.occurredAt).toLocaleString("id-ID")}
                  </p>
                  <p className="text-destructive">{e.lastError}</p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Bereskan penyebabnya di back-office (mis. tambahkan kasir ke outlet), lalu kirim ulang.</p>
            <Button variant="outline" onClick={() => void resendDead(getDb()).then(kickSync)}>
              <Send /> Kirim ulang
            </Button>
          </CardContent>
        </Card>
      )}
      <EmergencyExport managers={managers} verify={isManagerPin} build={() => buildDeviceExport()} />
    </div>
  );
}
