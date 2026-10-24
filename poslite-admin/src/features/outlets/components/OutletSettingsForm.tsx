"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { FormField, selectClass } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

import { type OutletSettings, TIMEZONES, useOutletSettings, useSaveOutletSettings } from "../application/use-outlet-admin";
import { bpsToPercent, percentToBps } from "../domain/rates";

const OPEN_BILLS_EXIST = "Masih ada bill terbuka di outlet ini. Selesaikan dulu sebelum beralih ke mode kasir.";

export function OutletSettingsForm({ outletId }: { outletId: string }) {
  const settings = useOutletSettings(outletId);
  if (!settings.data) return null;
  // Keyed by outlet so switching outlets starts a fresh form.
  return <SettingsFields key={outletId} outletId={outletId} initial={settings.data} />;
}

function SettingsFields({ outletId, initial }: { outletId: string; initial: OutletSettings }) {
  const save = useSaveOutletSettings(outletId);
  const [name, setName] = useState(initial.name);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [cutoff, setCutoff] = useState(initial.business_day_cutoff);
  const [tax, setTax] = useState(bpsToPercent(initial.tax_rate_bps));
  const [service, setService] = useState(bpsToPercent(initial.service_rate_bps));
  const [header, setHeader] = useState(initial.receipt_header);
  const [footer, setFooter] = useState(initial.receipt_footer);
  const [serviceMode, setServiceMode] = useState(initial.service_mode ?? "counter");
  const [roundingUnit, setRoundingUnit] = useState(initial.cash_rounding_unit ?? 0);
  const [roundingMode, setRoundingMode] = useState(initial.cash_rounding_mode ?? "nearest");
  // An empty rate field means "no tax/service" rather than an error.
  const taxBps = tax.trim() === "" ? 0 : percentToBps(tax);
  const serviceBps = service.trim() === "" ? 0 : percentToBps(service);
  const canSave = name.trim() !== "" && taxBps !== null && serviceBps !== null && /^\d{2}:\d{2}$/.test(cutoff);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const body = { name: name.trim(), timezone, business_day_cutoff: cutoff, tax_rate_bps: taxBps, service_rate_bps: serviceBps, receipt_header: header, receipt_footer: footer, service_mode: serviceMode, cash_rounding_unit: roundingUnit, cash_rounding_mode: roundingMode };
    save.mutate(body, {
      onSuccess: () => toast.success("Pengaturan disimpan"),
      onError: (e) => toast.error(e instanceof ApiError && e.code === "OPEN_BILLS_EXIST" ? OPEN_BILLS_EXIST : "Gagal menyimpan"),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border bg-card p-4">
      <h2 className="font-semibold">
        Pengaturan <span className="text-muted-foreground">({initial.code})</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="outlet-name" label="Nama">
          <Input id="outlet-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField id="outlet-timezone" label="Zona waktu">
          <select id="outlet-timezone" className={selectClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="outlet-tax" label="Pajak (%)">
          <Input id="outlet-tax" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} aria-invalid={taxBps === null} />
        </FormField>
        <FormField id="outlet-service" label="Service charge (%)">
          <Input id="outlet-service" inputMode="decimal" value={service} onChange={(e) => setService(e.target.value)} aria-invalid={serviceBps === null} />
        </FormField>
        <FormField id="outlet-cutoff" label="Tutup hari bisnis">
          <Input id="outlet-cutoff" type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
        </FormField>
      </div>
      <FormField id="outlet-service-mode" label="Mode layanan">
        <select id="outlet-service-mode" className={selectClass} value={serviceMode} onChange={(e) => setServiceMode(e.target.value as typeof serviceMode)}>
          <option value="counter">Kasir (pesan & bayar di kasir)</option>
          <option value="table_service">Layanan meja (pelayan mencatat pesanan dari banyak perangkat)</option>
        </select>
      </FormField>
      <p className="text-xs text-muted-foreground">
        Mode kasir: bill meja hanya di perangkat yang membukanya, 100% offline. Layanan meja: bill disimpan di server sehingga kasir melihat dan menagih bill pelayan;
        perangkat beralih mode setelah bill terbukanya selesai.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id="outlet-rounding-unit" label="Pembulatan tunai">
          <select id="outlet-rounding-unit" className={selectClass} value={roundingUnit} onChange={(e) => setRoundingUnit(Number(e.target.value) as typeof roundingUnit)}>
            <option value={0}>Tidak dibulatkan</option>
            <option value={100}>Rp 100</option>
            <option value={500}>Rp 500</option>
            <option value={1000}>Rp 1.000</option>
          </select>
        </FormField>
        <FormField id="outlet-rounding-mode" label="Arah pembulatan">
          <select id="outlet-rounding-mode" className={selectClass} value={roundingMode} disabled={roundingUnit === 0} onChange={(e) => setRoundingMode(e.target.value as typeof roundingMode)}>
            <option value="nearest">Terdekat</option>
            <option value="down">Ke bawah</option>
          </select>
        </FormField>
      </div>
      <p className="text-xs text-muted-foreground">Hanya bagian yang dibayar tunai yang dibulatkan; total dan pajak tidak berubah. Selisihnya tercatat sebagai pembulatan.</p>
      <p className="text-xs text-muted-foreground">Transaksi sebelum jam tutup hari bisnis dihitung ke hari sebelumnya. Tarif baru berlaku untuk pesanan baru setelah perangkat sinkron.</p>
      <FormField id="outlet-header" label="Header struk">
        <Textarea id="outlet-header" rows={2} value={header} onChange={(e) => setHeader(e.target.value)} />
      </FormField>
      <FormField id="outlet-footer" label="Footer struk">
        <Textarea id="outlet-footer" rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} />
      </FormField>
      <Button type="submit" disabled={!canSave || save.isPending}>
        Simpan pengaturan
      </Button>
    </form>
  );
}
