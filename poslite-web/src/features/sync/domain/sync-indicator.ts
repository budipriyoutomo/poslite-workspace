/** What the header badge is computed from (15 · UX-01). */
export interface SyncFacts {
  mode: "server" | "demo";
  isOnline: boolean;
  pending: number; // pending + failed + sending
  dead: number;
  lastSyncAt: string | null;
  now: Date;
}

export type SyncIndicator =
  | { state: "demo" }
  | { state: "failed"; dead: number }
  | { state: "stale"; since: string | null }
  | { state: "offline"; pending: number }
  | { state: "sending"; pending: number }
  | { state: "synced"; minutesAgo: number | null };

/** Waiting events whose last sync is older than this need a manager's attention. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/** The first matching state wins: failed, stale, offline / sending, synced. */
export function syncIndicator(f: SyncFacts): SyncIndicator {
  if (f.mode === "demo") return { state: "demo" };
  if (f.dead > 0) return { state: "failed", dead: f.dead };
  const ageMs = f.lastSyncAt === null ? null : f.now.getTime() - Date.parse(f.lastSyncAt);
  if (f.pending > 0 && (ageMs === null || ageMs > STALE_AFTER_MS)) return { state: "stale", since: f.lastSyncAt };
  if (!f.isOnline) return { state: "offline", pending: f.pending };
  if (f.pending > 0) return { state: "sending", pending: f.pending };
  return { state: "synced", minutesAgo: ageMs === null ? null : Math.max(0, Math.floor(ageMs / 60_000)) };
}
