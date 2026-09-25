"use client";

import { useReceiptLines } from "../application/use-receipt-lines";

/** On-screen copy of the receipt, identical to what the printer gets. */
export function ReceiptPreview({ orderId }: { orderId: string }) {
  const lines = useReceiptLines(orderId);
  if (!lines) return null;
  return (
    <pre aria-label="Pratinjau struk" className="mx-auto w-fit rounded-md border bg-white px-3 py-2 font-mono text-[11px] leading-tight text-black shadow-sm">
      {lines.join("\n")}
    </pre>
  );
}
