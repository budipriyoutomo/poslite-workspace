"use client";

import { type FormEvent, useState } from "react";

import { useSessionStore } from "@/features/auth";
import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { FormField, selectClass } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import { TIMEZONES, useCreateOutlet } from "../application/use-outlet-admin";

const ERRORS: Record<string, string> = { OUTLET_CODE_TAKEN: "Kode outlet sudah dipakai" };

export function NewOutletForm({ onCreated }: { onCreated: (outletId: string) => void }) {
  const create = useCreateOutlet();
  const brandId = useSessionStore((s) => s.session?.brandId ?? null); // a new outlet joins the active brand
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(TIMEZONES[0]!.value);
  const canSave = brandId !== null && /^[A-Z0-9]{2,10}$/.test(code) && name.trim() !== "";
  const error = create.error instanceof ApiError ? (ERRORS[create.error.code] ?? create.error.message) : create.error && "Gagal membuat outlet";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    create.mutate({ brand_id: brandId, code, name: name.trim(), timezone }, { onSuccess: (outlet) => onCreated(outlet.id) });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="new-outlet-code" label="Kode">
          <Input id="new-outlet-code" placeholder="BDG01" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} />
        </FormField>
        <div className="sm:col-span-2">
          <FormField id="new-outlet-name" label="Nama outlet">
            <Input id="new-outlet-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
        </div>
      </div>
      <FormField id="new-outlet-timezone" label="Zona waktu">
        <select id="new-outlet-timezone" className={selectClass} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {TIMEZONES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </FormField>
      <p className="text-xs text-muted-foreground">Kode menjadi awalan nomor struk (mis. BDG01A-260926-0001) dan tidak bisa diubah.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={!canSave || create.isPending}>
        Buat outlet
      </Button>
    </form>
  );
}
