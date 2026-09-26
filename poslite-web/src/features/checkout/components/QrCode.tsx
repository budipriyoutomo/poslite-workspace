"use client";

import { useEffect, useState } from "react";

type Matrix = boolean[][];

/** QR drawn as SVG squares (no HTML injection); the encoder loads only when a QR is shown. */
export function QrCode({ value, label, size = 240 }: { value: string; label: string; size?: number }) {
  const [matrix, setMatrix] = useState<Matrix | null>(null);

  useEffect(() => {
    let isCurrent = true;
    void import("qrcode-generator").then(({ default: qrcode }) => {
      const qr = qrcode(0, "M");
      qr.addData(value);
      qr.make();
      const n = qr.getModuleCount();
      const cells = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
      if (isCurrent) setMatrix(cells);
    });
    return () => {
      isCurrent = false;
    };
  }, [value]);

  const n = matrix?.length ?? 21;
  return (
    <svg role="img" aria-label={label} viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={size} height={size} className="rounded-lg bg-white" shapeRendering="crispEdges">
      {matrix?.flatMap((row, r) => row.map((dark, c) => (dark ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} /> : null)))}
    </svg>
  );
}
