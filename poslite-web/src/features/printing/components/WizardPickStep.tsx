"use client";

import { Bluetooth, Search } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";

import type { PrinterRole } from "../application/configured-printer";
import { bridgeClient, type PrinterSetupDeps, savePrinterAddress } from "../application/printer-setup";
import type { usePrinterSetup } from "../application/use-printer-setup";
import { copy, printerErrorMessage } from "../copy";
import type { ConnectionKind } from "../domain/connection-kinds";

type Setup = ReturnType<typeof usePrinterSetup>;
interface Props {
  role: PrinterRole;
  deps: PrinterSetupDeps;
  setup: Setup;
  /** Chosen on the step before: the saved config may not have reached the live query yet. */
  kind: ConnectionKind;
  onNext: () => void;
}

/** "Pilih printer": the bridge looks on the LAN, or the browser's picker finds a Bluetooth/USB one. */
export function WizardPickStep(props: Props) {
  if (props.kind !== "lan") return <DevicePick {...props} />;
  return props.setup.addressDriver === "epson-epos" ? <PickerFallback {...props} /> : <LanPick {...props} />;
}

function DevicePick({ setup, onNext }: Props) {
  return (
    <div className="space-y-3 text-sm">
      <Button variant="outline" onClick={() => void setup.pair()} disabled={setup.isBusy}>
        <Bluetooth /> {copy.connectPrinter}
      </Button>
      <p className="text-xs text-muted-foreground">{setup.isPaired ? copy.paired : copy.pairHint}</p>
      {setup.message && <p className="text-xs text-destructive">{setup.message}</p>}
      <Button className="w-full" disabled={!setup.isPaired} onClick={onNext}>
        {copy.next}
      </Button>
    </div>
  );
}

/** Epson ePOS was picked under advanced settings: its address is typed there. */
function PickerFallback({ onNext }: Props) {
  return (
    <Button className="w-full" onClick={onNext}>
      {copy.next}
    </Button>
  );
}

function LanPick({ role, deps, setup, onNext }: Props) {
  const bridge = deps.bridge ?? bridgeClient;
  const [bridgeUrl, setBridgeUrl] = useState(setup.device?.bridgeUrl ?? copy.defaultBridgeUrl);
  const [token, setToken] = useState(setup.device?.bridgeToken ?? "");
  const [code, setCode] = useState("");
  // undefined = not looked yet; null = a bridge too old to look
  const [found, setFound] = useState<string[] | null>();
  const [address, setAddress] = useState(setup.device?.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const attempt = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      setError(copy.pairErrors[reason] ?? printerErrorMessage(e));
    }
  };
  const search = (withToken: string) => attempt(async () => setFound(await bridge.discover(bridgeUrl, withToken)));
  const pair = () =>
    attempt(async () => {
      const t = await bridge.pair(bridgeUrl, code);
      setToken(t);
      setCode("");
      await search(t);
    });
  const save = () =>
    attempt(async () => {
      await savePrinterAddress({ role, device: { bridgeUrl, bridgeToken: token, address } }, deps);
      onNext();
    });

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <Label htmlFor="wizard-bridge-url">{copy.bridgeUrl}</Label>
        <Input id="wizard-bridge-url" value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} inputMode="url" autoComplete="off" />
      </div>
      {token ? (
        <p className="text-xs text-success">{copy.bridgePaired}</p>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="wizard-pairing-code">{copy.pairingCode}</Label>
          <div className="flex gap-2">
            <Input id="wizard-pairing-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" autoComplete="off" />
            <Button variant="secondary" disabled={!bridgeUrl || code.trim().length !== 6} onClick={() => void pair()}>
              {copy.pairBridge}
            </Button>
          </div>
        </div>
      )}
      {token && found === undefined && (
        <Button variant="outline" onClick={() => void search(token)}>
          <Search /> {copy.searchAgain}
        </Button>
      )}
      {found && found.length > 0 && (
        <RadioGroup value={address} onValueChange={setAddress} className="gap-1.5">
          {found.map((a) => (
            <Label key={a} htmlFor={`found-${a}`} className="flex items-center gap-2 rounded-md border p-2 font-mono">
              <RadioGroupItem id={`found-${a}`} value={a} /> {a}
            </Label>
          ))}
        </RadioGroup>
      )}
      {(found === null || found?.length === 0) && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{found === null ? copy.oldBridge : copy.noneFound}</p>
          <Label htmlFor="wizard-address">{copy.manualAddress}</Label>
          <Input id="wizard-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.1.60:9100" inputMode="url" autoComplete="off" />
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <Button className="w-full" disabled={!token || !address} onClick={() => void save()}>
        {copy.next}
      </Button>
    </div>
  );
}
