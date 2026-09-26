"use client";

import { RefreshCw, Send } from "lucide-react";

import { getDb } from "@/shared/db";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";

import { resendDead } from "../application/sync-engine";
import { kickSync } from "../application/sync-runner";
import { useDeadEvents, useSyncStatus } from "../application/use-sync-status";

const TYPE_LABEL: Record<string, string> = {
  "order.placed": "Penjualan",
  "shift.opened": "Buka shift",
  "shift.closed": "Tutup shift",
  "cash.moved": "Kas masuk/keluar",
  "order.voided": "Void",
};

export function SyncScreen() {
  const status = useSyncStatus();
  const dead = useDeadEvents();
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
            <dd className="text-right font-semibold text-red-600">{status.dead}</dd>
            <dt className="text-muted-foreground">Terakhir sinkron</dt>
            <dd className="text-right">{status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString("id-ID") : "—"}</dd>
          </dl>
          {status.lastError && <p className="rounded bg-amber-50 p-2 text-amber-800">Terakhir gagal: {status.lastError}</p>}
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
                  <p className="text-red-700">{e.lastError}</p>
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
    </div>
  );
}
