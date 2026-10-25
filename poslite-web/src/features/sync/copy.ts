// UI text for the sync feature (Bahasa Indonesia; one place per feature for future i18n).
import type { SyncIndicator } from "./domain/sync-indicator";

const clock = (iso: string) => new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function age(minutes: number): string {
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} mnt lalu`;
  return `${Math.floor(minutes / 60)} jam lalu`;
}

/** Header badge text: a short title that always shows, and a detail that phones may hide. */
export function badgeText(i: SyncIndicator): { title: string; detail?: string } {
  switch (i.state) {
    case "demo":
      return { title: "DEMO" };
    case "failed":
      return { title: `${i.dead} gagal`, detail: `${i.dead} transaksi gagal dikirim` };
    case "stale":
      return i.since === null ? { title: "Belum pernah sync" } : { title: "Belum sync", detail: `Belum sync sejak ${clock(i.since)}` };
    case "offline":
      return i.pending > 0 ? { title: "Offline", detail: `Offline · ${i.pending} transaksi menunggu` } : { title: "Offline" };
    case "sending":
      return { title: `Mengirim ${i.pending}…` };
    case "synced":
      return i.minutesAgo === null ? { title: "Tersinkron" } : { title: "Tersinkron", detail: `Tersinkron · ${age(i.minutesAgo)}` };
  }
}

export const copy = {
  detailsTitle: "Status sinkronisasi",
  lastSync: "Sinkron terakhir",
  never: "Belum pernah",
  pending: "Menunggu dikirim",
  dead: "Gagal dikirim",
  resend: "Kirim ulang",
  openSync: "Buka layar Sync",
  formatTime: clock,
} as const;
