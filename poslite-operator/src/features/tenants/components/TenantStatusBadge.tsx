import { Badge } from "@/shared/ui/badge";

import { tenantStatusLabel } from "../domain/labels";

export function TenantStatusBadge({ status, reason }: { status: string; reason: string | null | undefined }) {
  return <Badge variant={status === "suspended" ? "destructive" : "default"}>{tenantStatusLabel(status, reason)}</Badge>;
}
