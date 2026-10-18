"use client";

import { toast } from "sonner";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

import { useDeliveries, useRetryDelivery } from "../application/use-webhooks";

const STATUS: Record<string, string> = { pending: "Menunggu", delivered: "Terkirim", dead: "Gagal" };
const time = new Intl.DateTimeFormat("id-ID", { dateStyle: "short", timeStyle: "short" });

export function DeliveriesTable({ endpointId }: { endpointId: string }) {
  const deliveries = useDeliveries(endpointId);
  const retry = useRetryDelivery();
  if (!deliveries.data) return null;
  if (deliveries.data.length === 0) return <p className="text-sm text-muted-foreground">Belum ada pengiriman.</p>;

  return (
    <div className="overflow-x-auto">
      <table aria-label="Riwayat pengiriman" className="w-full text-sm">
        <tbody>
          {deliveries.data.map((d) => (
            <tr key={d.id} aria-label={`${d.event_type} ${STATUS[d.status] ?? d.status}`} className="border-b last:border-0">
              <td className="py-1.5">{time.format(new Date(d.created_at))}</td>
              <td className="py-1.5 font-mono text-xs">{d.event_type}</td>
              <td className="py-1.5">
                <Badge variant={d.status === "dead" ? "destructive" : d.status === "delivered" ? "default" : "secondary"}>{STATUS[d.status] ?? d.status}</Badge>
              </td>
              <td className="py-1.5 tabular-nums">{d.attempts}×</td>
              <td className="py-1.5 text-muted-foreground">{d.last_status_code ? `HTTP ${d.last_status_code}` : (d.last_error ?? "")}</td>
              <td className="py-1.5 text-right">
                {d.status !== "delivered" && (
                  <Button size="sm" variant="outline" onClick={() => retry.mutate(d.id, { onError: () => toast.error("Gagal mengirim ulang") })}>
                    Kirim ulang
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
