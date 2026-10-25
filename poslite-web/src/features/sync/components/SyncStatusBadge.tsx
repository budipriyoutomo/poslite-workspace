"use client";

import { CloudAlert, CloudCheck, CloudOff, RefreshCw } from "lucide-react";
import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { cn } from "@/shared/ui/utils";

import { badgeText, copy } from "../copy";
import type { SyncIndicator } from "../domain/sync-indicator";

type Tone = "ok" | "wait" | "error";
type Props = { indicator: SyncIndicator; pending: number; dead: number; lastSyncAt: string | null; onResend: () => void };

const TONE: Record<SyncIndicator["state"], Tone> = { synced: "ok", sending: "wait", offline: "wait", stale: "error", failed: "error", demo: "error" };
const TONE_CLASS: Record<Tone, string> = {
  ok: "bg-emerald-500/15 text-emerald-300",
  wait: "bg-amber-500/20 text-amber-200",
  error: "bg-red-500/25 text-red-200",
};

function ToneIcon({ indicator }: { indicator: SyncIndicator }) {
  if (indicator.state === "synced") return <CloudCheck aria-hidden className="size-3.5" />;
  if (indicator.state === "sending") return <RefreshCw aria-hidden className="size-3.5 animate-spin" />;
  if (indicator.state === "offline") return <CloudOff aria-hidden className="size-3.5" />;
  return <CloudAlert aria-hidden className="size-3.5" />;
}

/** One always-visible sync badge (15 · UX-01); tapping it shows the counts and a resend. */
export function SyncStatusBadge({ indicator, pending, dead, lastSyncAt, onResend }: Props) {
  const tone = TONE[indicator.state];
  const { title, detail } = badgeText(indicator);
  const pill = cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", TONE_CLASS[tone]);

  if (indicator.state === "demo") return <span className={cn(pill, "tracking-wider")}>{title}</span>;

  return (
    <Popover>
      <PopoverTrigger aria-label={detail ?? title} data-tone={tone} className={cn(pill, "min-h-8 hover:brightness-125")}>
        <ToneIcon indicator={indicator} />
        {detail ? (
          <>
            <span className="sm:hidden">{title}</span>
            <span className="max-sm:hidden">{detail}</span>
          </>
        ) : (
          <span>{title}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-3 text-sm">
        <p className="font-semibold">{copy.detailsTitle}</p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">{copy.lastSync}</dt>
          <dd className="text-right">{lastSyncAt ? copy.formatTime(lastSyncAt) : copy.never}</dd>
          <dt className="text-muted-foreground">{copy.pending}</dt>
          <dd className="text-right font-semibold">{pending}</dd>
          <dt className="text-muted-foreground">{copy.dead}</dt>
          <dd className={cn("text-right font-semibold", dead > 0 && "text-destructive")}>{dead}</dd>
        </dl>
        <div className="flex gap-2">
          <Button size="sm" onClick={onResend}>
            <RefreshCw /> {copy.resend}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/sync">{copy.openSync}</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
