"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/features/auth";
import { useOnlineStatus } from "@/shared/hooks";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

import { refundOrder } from "../application/correct-order";
import { lookupOrder, useApprovers, usePaymentMethods, verifyApprover } from "../application/use-corrections";
import { copy } from "../copy";
import type { LookedUpOrder } from "../domain/refund-plan";
import { RefundDialog } from "./RefundDialog";

/** Refund an order sold on another tablet of this outlet: only online (ADR-023). */
export function OrderLookup() {
  const isOnline = useOnlineStatus();
  const user = useSession((s) => s.user);
  const methods = usePaymentMethods();
  const approvers = useApprovers();
  const [receiptNo, setReceiptNo] = useState("");
  const [found, setFound] = useState<LookedUpOrder | null>(null);

  const search = async () => {
    try {
      const order = await lookupOrder(receiptNo.trim().toUpperCase());
      if (!order) return void toast.error(copy.lookupMissing);
      setFound(order);
    } catch {
      toast.error(copy.lookupOffline);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input aria-label={copy.lookupLabel} placeholder={copy.lookupPlaceholder} value={receiptNo} onChange={(e) => setReceiptNo(e.target.value)} disabled={!isOnline} />
        <Button variant="outline" disabled={!isOnline || receiptNo.trim() === ""} onClick={search}>
          <Search /> {copy.lookup}
        </Button>
      </div>
      {!isOnline && <p className="text-xs text-muted-foreground">{copy.lookupOffline}</p>}
      {found && user && (
        <RefundDialog
          source={found.source}
          methods={methods}
          defaultMethodId={methods.find((m) => found.paymentMethodIds.includes(m.id))?.id ?? methods[0]?.id ?? ""}
          actorIsManager={user.role !== "cashier"}
          approvers={approvers}
          verifyApprover={verifyApprover}
          onConfirm={async (request) => {
            try {
              const refund = await refundOrder({ source: found.source, actorId: user.id, ...request });
              toast.success(copy.refunded(refund.refundNo));
              setFound(null);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : String(e));
            }
          }}
          onClose={() => setFound(null)}
        />
      )}
    </div>
  );
}
