"use client";

import { useEffect, useState } from "react";

import { formatRupiah } from "@/shared/money";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";

import { type QrisCharge, type QrisClient, waitForQrisPayment } from "../application/dynamic-qris";
import { copy } from "../copy";
import { QrCode } from "./QrCode";

interface Props {
  amount: number;
  client: QrisClient;
  newId: () => string;
  onPaid: (payment: { reference: string; amount: number }) => void;
  onClose: () => void;
  pollMs?: number;
}

type State = { kind: "creating" } | { kind: "waiting"; charge: QrisCharge } | { kind: "failed"; message: string };

/** Online QRIS for the exact amount (ADR-019); any failure sends the cashier back to static QRIS. */
export function DynamicQrisDialog({ amount, client, newId, onPaid, onClose, pollMs = 2_000 }: Props) {
  const [state, setState] = useState<State>({ kind: "creating" });

  useEffect(() => {
    const controller = new AbortController();
    const id = newId();
    void (async () => {
      try {
        const charge = await client.create(id, amount);
        setState({ kind: "waiting", charge });
        const result = await waitForQrisPayment(client, id, { intervalMs: pollMs, timeoutMs: 15 * 60_000, signal: controller.signal });
        if (result.status === "paid") onPaid({ reference: result.id, amount: result.amount });
        else setState({ kind: "failed", message: copy.qrisExpired });
      } catch (e) {
        if (!controller.signal.aborted) setState({ kind: "failed", message: e instanceof Error && e.message === "cancelled" ? "" : copy.qrisUnavailable });
      }
    })();
    return () => controller.abort();
    // One charge per opened dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{copy.qrisTitle}</DialogTitle>
          <DialogDescription>{formatRupiah(amount)}</DialogDescription>
        </DialogHeader>
        {state.kind === "creating" && <p className="py-10 text-center text-muted-foreground">{copy.qrisCreating}</p>}
        {state.kind === "waiting" && (
          <div className="flex flex-col items-center gap-3">
            <QrCode value={state.charge.qrString} label={`QR pembayaran ${formatRupiah(amount)}`} />
            <p className="text-sm text-muted-foreground">{copy.qrisWaiting}</p>
          </div>
        )}
        {state.kind === "failed" && (
          <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            {state.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
