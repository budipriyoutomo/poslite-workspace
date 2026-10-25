"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { usePaymentMethods } from "@/features/payment-methods";
import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { FormField, selectClass } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import { type Channel, type ChannelIn, useSaveChannel } from "../application/use-channels";
import { KIND_LABEL, PRICE_MODE_LABEL } from "../domain/describe";

const ERRORS: Record<string, string> = { CHANNEL_CODE_TAKEN: "Kode channel sudah dipakai di brand ini" };
const digits = (text: string, max: number) => text.replace(/\D/g, "").slice(0, max);

export function ChannelForm({ channel, onDone }: { channel?: Channel; onDone: () => void }) {
  const methods = usePaymentMethods();
  const save = useSaveChannel();
  const [code, setCode] = useState(channel?.code ?? "");
  const [name, setName] = useState(channel?.name ?? "");
  const [kind, setKind] = useState<ChannelIn["kind"]>(channel?.kind ?? "take_away");
  const [mode, setMode] = useState<NonNullable<ChannelIn["price_mode"]>>(channel?.price_mode ?? "base");
  const [markup, setMarkup] = useState(channel?.markup_bps ? String(channel.markup_bps / 100) : "");
  const [unit, setUnit] = useState(String(channel?.markup_rounding_unit ?? 100));
  const [methodId, setMethodId] = useState(channel?.default_payment_method_id ?? "");
  const [service, setService] = useState(channel?.applies_service ?? true);
  const [tax, setTax] = useState(channel?.applies_tax ?? true);
  const [needsRef, setNeedsRef] = useState(channel?.requires_external_ref ?? false);
  const markupBps = mode === "markup_bps" ? Math.round(Number(markup.replace(",", ".")) * 100) : 0;
  const canSave = /^[A-Z0-9_]{2,20}$/.test(code) && name.trim() !== "" && Number(unit) >= 1 && (mode !== "markup_bps" || (markupBps > 0 && markupBps <= 10_000));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const body: ChannelIn = {
      code,
      name: name.trim(),
      kind,
      price_mode: mode,
      markup_bps: markupBps,
      markup_rounding_unit: Number(unit),
      default_payment_method_id: methodId || null,
      applies_service: service,
      applies_tax: tax,
      requires_external_ref: needsRef,
      is_active: channel?.is_active ?? true,
      sort_order: channel?.sort_order ?? 0,
    };
    save.mutate(
      { id: channel?.id, body },
      {
        onSuccess: () => (toast.success("Channel disimpan"), onDone()),
        onError: (err) => toast.error(err instanceof ApiError ? (ERRORS[err.code] ?? err.message) : "Gagal menyimpan"),
      },
    );
  };

  const check = (label: string, value: boolean, set: (on: boolean) => void) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox aria-label={label} checked={value} onCheckedChange={(on) => set(on === true)} /> {label}
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="channel-code" label="Kode">
          <Input id="channel-code" placeholder="GOFOOD" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 20))} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField id="channel-name" label="Nama">
            <Input id="channel-name" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
          </FormField>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="channel-kind" label="Jenis">
          <select id="channel-kind" className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as ChannelIn["kind"])}>
            {Object.entries(KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="channel-mode" label="Harga">
          <select id="channel-mode" className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            {Object.entries(PRICE_MODE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      {mode === "markup_bps" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="channel-markup" label="Markup (%)">
            <Input id="channel-markup" inputMode="decimal" value={markup} onChange={(e) => setMarkup(e.target.value.replace(/[^\d,.]/g, "").slice(0, 6))} />
          </FormField>
          <FormField id="channel-unit" label="Dibulatkan ke atas (Rp)">
            <Input id="channel-unit" inputMode="numeric" value={unit} onChange={(e) => setUnit(digits(e.target.value, 5))} />
          </FormField>
        </div>
      )}
      {mode === "price_list" && <p className="text-xs text-muted-foreground">Isi harga per menu lewat tombol Harga setelah disimpan. Menu tanpa harga tidak dijual di channel ini.</p>}
      <FormField id="channel-method" label="Metode bayar default">
        <select id="channel-method" className={selectClass} value={methodId} onChange={(e) => setMethodId(e.target.value)}>
          <option value="">Tunai (bawaan kasir)</option>
          {(methods.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </FormField>
      <div className="space-y-2">
        {check("Kena service charge", service, setService)}
        {check("Kena PB1", tax, setTax)}
        {check("Wajib nomor order aplikasi", needsRef, setNeedsRef)}
      </div>
      <Button type="submit" className="w-full" disabled={!canSave || save.isPending}>
        Simpan
      </Button>
    </form>
  );
}
