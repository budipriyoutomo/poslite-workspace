"use client";

import { Save } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { PrinterDevice } from "@/shared/db";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

import { copy } from "../copy";
import { pairPrintBridge } from "../application/printer-setup";

/** Address of a LAN printer: Epson ePOS (printer address) or Print Bridge (bridge URL + token + printer IP:port). */
export function PrinterAddressForm({
  id,
  isBridge,
  device,
  isBusy,
  onSave,
  pair = pairPrintBridge,
}: {
  id: string;
  isBridge: boolean;
  device: PrinterDevice | undefined;
  isBusy: boolean;
  onSave: (device: PrinterDevice) => void;
  /** P1-5: the bridge's 6-digit code → its token. */
  pair?: (bridgeUrl: string, code: string) => Promise<string>;
}) {
  const [address, setAddress] = useState(device?.address ?? "");
  const [bridgeUrl, setBridgeUrl] = useState(device?.bridgeUrl ?? "");
  const [bridgeToken, setBridgeToken] = useState(device?.bridgeToken ?? "");
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState<{ error?: string; isPaired?: boolean }>({});
  const pairNow = async () => {
    try {
      setBridgeToken(await pair(bridgeUrl, code));
      setPairing({ isPaired: true });
      setCode("");
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      setPairing({ error: copy.pairErrors[reason] ?? reason });
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(isBridge ? { bridgeUrl, bridgeToken, address } : { address });
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border bg-muted/50 p-2.5">
      {isBridge && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`${id}-bridge-url`}>{copy.bridgeUrl}</Label>
            <Input id={`${id}-bridge-url`} value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} placeholder="http://localhost:9180" inputMode="url" autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs" htmlFor={`${id}-bridge-token`}>{copy.bridgeToken}</Label>
            <Input id={`${id}-bridge-token`} type="password" value={bridgeToken} onChange={(e) => setBridgeToken(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs" htmlFor={`${id}-pairing-code`}>{copy.pairingCode}</Label>
            <div className="flex gap-2">
              <Input id={`${id}-pairing-code`} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" autoComplete="off" />
              <Button type="button" size="sm" variant="secondary" disabled={!bridgeUrl || code.trim().length !== 6} onClick={() => void pairNow()}>
                {copy.pairBridge}
              </Button>
            </div>
            {pairing.error && (
              <p role="alert" className="text-xs text-destructive">
                {pairing.error}
              </p>
            )}
            {pairing.isPaired && <p className="text-xs text-success">{copy.bridgePaired}</p>}
          </div>
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={`${id}-address`}>{copy.printerAddress}</Label>
        <Input id={`${id}-address`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={isBridge ? "192.168.1.60:9100" : "192.168.1.50"} inputMode="url" autoComplete="off" />
      </div>
      <p className="text-xs text-muted-foreground">{isBridge ? copy.bridgeHint : copy.eposHint}</p>
      <Button type="submit" size="sm" variant="outline" disabled={isBusy}>
        <Save /> {copy.saveAddress}
      </Button>
    </form>
  );
}
