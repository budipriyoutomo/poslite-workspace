"use client";

import { BookOpen, Pencil, Printer, RotateCw } from "lucide-react";
import { useState } from "react";

import { useSession } from "@/features/auth";
import { isManager } from "@/shared/db";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { StatusPill } from "@/shared/ui/status-pill";

import type { PrinterRole } from "../application/configured-printer";
import type { PrinterSetupDeps } from "../application/printer-setup";
import { defaultPrinterSetupDeps, usePrinterSetup } from "../application/use-printer-setup";
import { ROLES, usePrinterStatuses } from "../application/use-printer-statuses";
import { copy } from "../copy";
import { kindOf } from "../domain/connection-kinds";
import type { PrinterStatus } from "../domain/printer-status";
import { PrinterRoleSettings } from "./AdvancedPrinterSettings";
import { PrinterGuide } from "./PrinterGuide";
import { PrinterWizard } from "./PrinterWizard";

export { PrinterRoleSettings } from "./AdvancedPrinterSettings";

const TONE = { ready: "ok", unreachable: "error", unset: "neutral" } as const;
const statusLabel = (s: PrinterStatus) => (s.state === "unreachable" ? copy.status.unreachable(s.waiting) : copy.status[s.state]);

/**
 * Settings → Printer (15 · UX-08): each role's printer with its status. Everyone may test print and
 * retry; only a manager changes a printer, through the wizard or the advanced settings.
 */
export function PrinterSettings({ deps: injected, onRetry }: { deps?: PrinterSetupDeps; onRetry?: (role: PrinterRole) => void }) {
  const [deps] = useState(() => injected ?? defaultPrinterSetupDeps());
  const statuses = usePrinterStatuses(deps.db);
  const canChange = isManager(useSession((s) => s.user)?.role);
  const [editing, setEditing] = useState<PrinterRole | null>(null);
  if (!statuses) return null;
  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
      {ROLES.map((role) => (
        <PrinterCard key={role} role={role} deps={deps} status={statuses[role].status} driver={statuses[role].config?.driver} canChange={canChange} onChange={() => setEditing(role)} {...(onRetry && role !== "receipt" && { onRetry: () => onRetry(role) })} />
      ))}
      {editing && <PrinterWizard role={editing} deps={deps} onClose={() => setEditing(null)} />}
    </div>
  );
}

interface CardProps {
  role: PrinterRole;
  deps: PrinterSetupDeps;
  status: PrinterStatus;
  driver: Parameters<typeof kindOf>[0] | undefined;
  canChange: boolean;
  onChange: () => void;
  onRetry?: () => void;
}

function PrinterCard({ role, deps, status, driver, canChange, onChange, onRetry }: CardProps) {
  const setup = usePrinterSetup(deps, role);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const kind = driver ? kindOf(driver) : role === "receipt" ? "system" : "none";
  return (
    <Card size="sm" role="region" aria-labelledby={`printer-${role}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <h2 id={`printer-${role}`}>{copy.titles[role]}</h2>
          <StatusPill tone={TONE[status.state]}>{statusLabel(status)}</StatusPill>
        </CardTitle>
        <CardDescription className="text-xs">{copy.kinds[kind].label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void setup.testPrint()} disabled={setup.isBusy || status.state === "unset"}>
            <Printer /> {copy.testPrint}
          </Button>
          {status.state === "unreachable" && onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry}>
              <RotateCw /> {copy.retry}
            </Button>
          )}
          {canChange && (
            <Button size="sm" variant="outline" onClick={onChange}>
              <Pencil /> {copy.change}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setIsGuideOpen(true)}>
            <BookOpen /> {copy.guide}
          </Button>
        </div>
        {setup.message && <p className="text-xs text-muted-foreground">{setup.message}</p>}
        {canChange && (
          // Mounted only when open: the technical choices stay out of the way (and out of the page).
          <details className="rounded-md border" onToggle={(e) => setIsAdvancedOpen(e.currentTarget.open)}>
            <summary className="cursor-pointer px-2.5 py-1.5 text-xs font-medium text-muted-foreground">{copy.advanced}</summary>
            {isAdvancedOpen && (
              <div className="border-t p-2">
                <PrinterRoleSettings role={role} deps={deps} />
              </div>
            )}
          </details>
        )}
      </CardContent>
      {isGuideOpen && <PrinterGuide onClose={() => setIsGuideOpen(false)} />}
    </Card>
  );
}
