"use client";

import { useEffect, useRef, useState } from "react";

import { formatRupiah } from "@/shared/money";

import { shortDate } from "../domain/labels";
import { daysBetween } from "../domain/range";
import { compactRupiah, niceTicks } from "../domain/scale";

const DEFAULT_W = 640; // until the container is measured (jsdom has no layout)
const H = 240;
const PAD = { left: 64, right: 8, top: 12, bottom: 28 };
const MAX_BAR = 24;
const MAX_X_LABELS = 8;

function columnPath(x: number, y: number, width: number, height: number): string {
  // Rounded 4px data-end on top, square at the baseline.
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

/** Revenue per business day: one series, so no legend box — the title names it. */
export function DailyRevenueChart({ from, to, days }: { from: string; to: string; days: { business_date: string; net: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  // The viewBox follows the rendered width, so axis labels stay 11px instead of scaling with the card.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(DEFAULT_W);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setW(Math.round(entry.contentRect.width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const byDate = new Map(days.map((d) => [d.business_date, d.net]));
  const series = daysBetween(from, to).map((date) => ({ date, net: byDate.get(date) ?? 0 }));
  const ticks = niceTicks(Math.max(0, ...series.map((d) => d.net)));
  const top = ticks[ticks.length - 1]!;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / series.length;
  const barW = Math.min(MAX_BAR, slot * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const labelEvery = Math.ceil(series.length / MAX_X_LABELS);
  const current = active === null ? null : series[active];
  const hasSales = series.some((d) => d.net > 0);

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold">Pendapatan harian</figcaption>
      {!hasSales && <p className="py-8 text-center text-sm text-muted-foreground">Belum ada penjualan pada periode ini.</p>}
      <div ref={box} className="relative" hidden={!hasSales}>
        {hasSales && (
          <svg role="img" aria-label="Pendapatan harian per tanggal operasional" viewBox={`0 0 ${W} ${H}`} className="w-full">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[11px] tabular-nums">
                  {compactRupiah(t)}
                </text>
              </g>
            ))}
            {series.map((d, i) => {
              const x = PAD.left + i * slot;
              const barH = (d.net / top) * plotH;
              return (
                <g
                  key={d.date}
                  role="button"
                  tabIndex={0}
                  aria-label={`${shortDate(d.date)}: ${formatRupiah(d.net)}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="cursor-default outline-none"
                >
                  {/* Hit target: the whole slot, not just the painted column. */}
                  <rect x={x} y={PAD.top} width={slot} height={plotH} fill="transparent" />
                  {barH > 0 && (
                    <path d={columnPath(x + (slot - barW) / 2, y(d.net), barW, barH)} fill="var(--chart-series-1)" opacity={active === null || active === i ? 1 : 0.55} />
                  )}
                  {i % labelEvery === 0 && (
                    <text x={x + slot / 2} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                      {shortDate(d.date)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {current && active !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-sm"
            style={{ left: `${((PAD.left + (active + 0.5) * slot) / W) * 100}%`, top: `${(y(current.net) / H) * 100}%` }}
          >
            <p className="font-semibold tabular-nums">{formatRupiah(current.net)}</p>
            <p className="text-muted-foreground">{shortDate(current.date)}</p>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Lihat tabel</summary>
        <div className="overflow-x-auto">
          <table aria-label="Pendapatan harian (tabel)" className="mt-2 w-full">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">Tanggal</th>
                <th className="py-1 text-right font-medium">Pendapatan</th>
              </tr>
            </thead>
            <tbody>
              {series.map((d) => (
                <tr key={d.date} className="border-t">
                  <td className="py-1">{shortDate(d.date)}</td>
                  <td className="py-1 text-right tabular-nums">{formatRupiah(d.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
