"use client";

import { Bluetooth, Printer } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";

import type { PrinterRole } from "../application/configured-printer";
import { choiceLabel, type PrinterChoice, type PrinterSetupDeps } from "../application/printer-setup";
import { defaultPrinterSetupDeps, usePrinterSetup } from "../application/use-printer-setup";
import { copy } from "../copy";
import { PrinterAddressForm } from "./PrinterAddressForm";

const PAPER_WIDTHS = [58, 80] as const;
const ROLES: PrinterRole[] = ["receipt", "kitchen", "bar"];

/** Settings → Printer (04-printing.md): one card per role — receipt, kitchen, bar. */
export function PrinterSettings({ deps: injected }: { deps?: PrinterSetupDeps }) {
  const [deps] = useState(() => injected ?? defaultPrinterSetupDeps());
  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
      {ROLES.map((role) => (
        <PrinterRoleSettings key={role} role={role} deps={deps} />
      ))}
    </div>
  );
}

/** Connection, paper width, pairing and a test print for one role's printer. */
export function PrinterRoleSettings({ role, deps }: { role: PrinterRole; deps: PrinterSetupDeps }) {
  const setup = usePrinterSetup(deps, role);
  if (setup.isLoading) return null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h2>{copy.titles[role]}</h2>
        </CardTitle>
        {role !== "receipt" && <CardDescription className="text-xs">{copy.stationHint}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{copy.connection}</legend>
          <RadioGroup className="gap-x-3 gap-y-1.5 sm:grid-cols-2" value={setup.choice} onValueChange={(v) => void setup.choose(v as PrinterChoice)} disabled={setup.isBusy}>
            {setup.choices.map((choice) => (
              <div key={choice} className="flex items-center gap-2">
                <RadioGroupItem id={`printer-${role}-${choice}`} value={choice} />
                <Label htmlFor={`printer-${role}-${choice}`}>{choiceLabel(choice)}</Label>
              </div>
            ))}
          </RadioGroup>
          {!setup.choices.includes("web-serial") && <p className="mt-1.5 text-xs text-muted-foreground">{copy.noWebSerial}</p>}
        </fieldset>

        {setup.hasOwnPrinter && (
          <fieldset className="flex items-center gap-4">
            <legend className="float-left text-xs font-medium text-muted-foreground">{copy.paperWidth}</legend>
            <RadioGroup className="flex w-auto gap-4" value={String(setup.paperWidth)} onValueChange={(v) => void setup.choosePaperWidth(Number(v) as 58 | 80)} disabled={setup.isBusy}>
              {PAPER_WIDTHS.map((w) => (
                <div key={w} className="flex items-center gap-2">
                  <RadioGroupItem id={`paper-${role}-${w}`} value={String(w)} />
                  <Label htmlFor={`paper-${role}-${w}`}>{w} mm</Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
        )}

        {setup.needsPairing && (
          <div className="space-y-1.5 rounded-md border bg-muted/50 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={setup.isPaired ? "default" : "outline"}>{setup.isPaired ? copy.paired : copy.notPaired}</Badge>
              <Button size="sm" variant="outline" onClick={() => void setup.pair()} disabled={setup.isBusy}>
                <Bluetooth /> {copy.pair}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{copy.pairHint}</p>
          </div>
        )}

        {setup.addressDriver && (
          <PrinterAddressForm
            key={setup.addressDriver}
            id={`address-${role}`}
            isBridge={setup.addressDriver === "bridge"}
            device={setup.device}
            isBusy={setup.isBusy}
            onSave={(device) => void setup.saveAddress(device)}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void setup.testPrint()} disabled={setup.isBusy || setup.choice === "none"}>
            <Printer /> {copy.testPrint}
          </Button>
          {setup.message && (
            <p role="status" className="text-xs text-muted-foreground">
              {setup.message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
