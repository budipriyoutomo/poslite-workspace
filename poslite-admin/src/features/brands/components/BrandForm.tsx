"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { ImageField, type UploadedImage } from "@/features/menu";
import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

import { type Brand, useSaveBrand } from "../application/use-brands";
import { DEFAULT_POLICY, DiscountPolicyFields, fromDraft, toDraft } from "./DiscountPolicyFields";

const ERRORS: Record<string, string> = { BRAND_CODE_TAKEN: "Kode brand sudah dipakai", INVALID_IMAGE_KEY: "Unggah ulang logonya" };

/** Name, code, logo and default receipt text; an outlet's own receipt text overrides it. */
export function BrandForm({ brand, onDone }: { brand?: Brand; onDone: () => void }) {
  const save = useSaveBrand();
  const [code, setCode] = useState(brand?.code ?? "");
  const [name, setName] = useState(brand?.name ?? "");
  const [logo, setLogo] = useState<UploadedImage | null>(brand?.logo_key ? { key: brand.logo_key, url: brand.logo_url ?? "" } : null);
  const [header, setHeader] = useState(brand?.receipt_header ?? "");
  const [footer, setFooter] = useState(brand?.receipt_footer ?? "");
  const [isActive, setIsActive] = useState(brand?.is_active ?? true);
  const [policy, setPolicy] = useState(toDraft(brand?.discount ?? DEFAULT_POLICY));
  const discount = fromDraft(policy);
  const canSave = /^[A-Z0-9]{2,20}$/.test(code) && name.trim() !== "" && discount !== null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || !discount) return;
    const body = { code, name: name.trim(), logo_key: logo?.key ?? null, receipt_header: header, receipt_footer: footer, is_active: isActive, discount };
    save.mutate(
      { id: brand?.id, body },
      {
        onSuccess: () => (toast.success("Brand disimpan"), onDone()),
        onError: (err) => toast.error(err instanceof ApiError ? (ERRORS[err.code] ?? err.message) : "Gagal menyimpan"),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <FormField id="brand-code" label="Kode">
          <Input id="brand-code" placeholder="SUSHI" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20))} />
        </FormField>
        <div className="col-span-2">
          <FormField id="brand-name" label="Nama brand">
            <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
        </div>
      </div>
      <ImageField value={logo} onChange={setLogo} title="Logo (opsional)" subject="logo brand" />
      <FormField id="brand-header" label="Header struk">
        <Textarea id="brand-header" rows={2} value={header} onChange={(e) => setHeader(e.target.value)} />
      </FormField>
      <FormField id="brand-footer" label="Footer struk">
        <Textarea id="brand-footer" rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} />
      </FormField>
      <p className="text-xs text-muted-foreground">Dipakai semua outlet brand ini, kecuali outlet yang mengisi header/footer sendiri.</p>
      <DiscountPolicyFields draft={policy} onChange={setPolicy} />
      {brand && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox aria-label="Aktif" checked={isActive} onCheckedChange={(on) => setIsActive(on === true)} /> Aktif
        </label>
      )}
      <Button type="submit" className="w-full" disabled={!canSave || save.isPending}>
        Simpan
      </Button>
    </form>
  );
}
