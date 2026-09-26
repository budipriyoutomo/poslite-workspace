const NICE = [1, 2, 2.5, 5, 10];

/** 0 plus about four round steps covering `max` (axis ticks read as clean numbers). */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = NICE.map((n) => n * magnitude).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

const UNITS: [number, string][] = [
  [1_000_000_000, "M"],
  [1_000_000, "jt"],
  [1_000, "rb"],
];

/** "Rp 72,8 rb" / "Rp 1,3 jt" — for axis ticks and tiles; exact values stay in tables. */
export function compactRupiah(value: number): string {
  const unit = UNITS.find(([size]) => Math.abs(value) >= size);
  if (!unit) return `Rp ${value}`;
  const [size, suffix] = unit;
  const number = (value / size).toFixed(1).replace(/\.0$/, "").replace(".", ",");
  return `Rp ${number} ${suffix}`;
}
