"use client";

import { Save } from "lucide-react";
import { type FormEvent, useState } from "react";

import type { PrinterDevice } from "@/shared/db";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

import { copy } from "../copy";

/** Address of a LAN printer: Epson ePOS (printer address) or Print Bridge (bridge URL + token + printer IP:port). */
export function PrinterAddressForm({ id, isBridge, device, isBusy, onSave }: { id: string; isBridge: boolean; device: PrinterDevice | undefined; isBusy: boolean; onSave: (device: PrinterDevice) => void }) {
  const [address, setAddress] = useState(device?.address ?? "");
  const [bridgeUrl, setBridgeUrl] = useState(device?.bridgeUrl ?? "");
  const [bridgeToken, setBridgeToken] = useState(device?.bridgeToken ?? "");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave(isBridge ? { bridgeUrl, bridgeToken, address } : { address });
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-md border bg-slate-50 p-3">
      {isBridge && (
        <>
          <div className="space-y-1">
            <Label htmlFor={`${id}-bridge-url`}>{copy.bridgeUrl}</Label>
            <Input id={`${id}-bridge-url`} value={bridgeUrl} onChange={(e) => setBridgeUrl(e.target.value)} placeholder="http://localhost:9180" inputMode="url" autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${id}-bridge-token`}>{copy.bridgeToken}</Label>
            <Input id={`${id}-bridge-token`} type="password" value={bridgeToken} onChange={(e) => setBridgeToken(e.target.value)} autoComplete="off" />
          </div>
        </>
      )}
      <div className="space-y-1">
        <Label htmlFor={`${id}-address`}>{copy.printerAddress}</Label>
        <Input id={`${id}-address`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder={isBridge ? "192.168.1.60:9100" : "192.168.1.50"} inputMode="url" autoComplete="off" />
      </div>
      <p className="text-xs text-muted-foreground">{isBridge ? copy.bridgeHint : copy.eposHint}</p>
      <Button type="submit" size="sm" variant="outline" disabled={isBusy}>
        <Save /> {copy.saveAddress}
      </Button>
    </form>
  );
}
