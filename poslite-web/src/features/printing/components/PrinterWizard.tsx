"use client";

import { Printer } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";

import type { PrinterRole } from "../application/configured-printer";
import { type PrinterSetupDeps, removePrinter } from "../application/printer-setup";
import { usePrinterSetup } from "../application/use-printer-setup";
import { copy } from "../copy";
import { type ConnectionKind, connectionKinds, type DriverType, kindOf } from "../domain/connection-kinds";
import { WizardPickStep } from "./WizardPickStep";

type Step = 2 | 3 | 4;

/**
 * Setting up one role's printer (15 · UX-08): role (the card it was opened from) → how it connects
 * → which printer → test print. Each step saves as it goes, as the advanced settings always did.
 */
export function PrinterWizard({ role, deps, onClose }: { role: PrinterRole; deps: PrinterSetupDeps; onClose: () => void }) {
  const setup = usePrinterSetup(deps, role);
  const kinds = useMemo(() => {
    const supported = new Set(Object.values(deps.printers.drivers).flatMap((d) => (d?.isSupported() ? [d.type as DriverType] : [])));
    return connectionKinds(role, supported);
  }, [deps.printers, role]);
  const current = setup.choice === "none" ? "none" : kindOf(setup.choice);
  const [kind, setKind] = useState<ConnectionKind | null>(null);
  const chosen = kind ?? (kinds.some((k) => k.kind === current) ? current : (kinds.find((k) => k.driver)?.kind ?? "none"));
  const [step, setStep] = useState<Step>(2);
  if (setup.isLoading) return null;

  const confirmKind = async () => {
    const choice = kinds.find((k) => k.kind === chosen);
    if (chosen === "none") return void (await removePrinter(role, deps), onClose());
    if (!choice?.driver) return;
    if (choice.driver !== setup.choice) await setup.choose(choice.driver);
    setStep(chosen === "same-as-receipt" ? 4 : 3);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent mobileSheet className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.wizardTitle(copy.titles[role])}</DialogTitle>
          <DialogDescription>
            {copy.stepOf(step)} · {copy.steps[step - 1]}
          </DialogDescription>
        </DialogHeader>
        {step === 2 && (
          <RadioGroup value={chosen} onValueChange={(v) => setKind(v as ConnectionKind)} className="gap-2">
            {kinds.map(({ kind: k, driver }) => {
              const isUnavailable = driver === null && k !== "none";
              return (
                <Label key={k} htmlFor={`kind-${k}`} className="flex items-start gap-3 rounded-lg border p-3 has-[:disabled]:opacity-60 has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem id={`kind-${k}`} value={k} disabled={isUnavailable} className="mt-0.5" />
                  <span className="space-y-0.5">
                    <span className="block font-semibold">{copy.kinds[k].label}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{isUnavailable ? copy.unavailableHere : copy.kinds[k].hint}</span>
                  </span>
                </Label>
              );
            })}
          </RadioGroup>
        )}
        {step === 3 && <WizardPickStep role={role} deps={deps} setup={setup} kind={chosen} onNext={() => setStep(4)} />}
        {step === 4 && (
          <div className="space-y-3 text-sm">
            {setup.hasOwnPrinter && (
              <RadioGroup aria-label={copy.paperWidth} className="flex gap-4" value={String(setup.paperWidth)} onValueChange={(v) => void setup.choosePaperWidth(Number(v) as 58 | 80)}>
                {[58, 80].map((w) => (
                  <Label key={w} htmlFor={`wizard-paper-${w}`} className="flex items-center gap-2">
                    <RadioGroupItem id={`wizard-paper-${w}`} value={String(w)} /> {w} mm
                  </Label>
                ))}
              </RadioGroup>
            )}
            <Button onClick={() => void setup.testPrint()} disabled={setup.isBusy}>
              <Printer /> {copy.testPrint}
            </Button>
            {setup.message && <p className="text-xs text-muted-foreground">{setup.message}</p>}
          </div>
        )}
        <DialogFooter>
          {step > 2 && (
            <Button variant="ghost" onClick={() => setStep(2)}>
              {copy.back}
            </Button>
          )}
          {step === 2 && <Button onClick={() => void confirmKind()}>{copy.next}</Button>}
          {step === 4 && <Button onClick={onClose}>{copy.done}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
