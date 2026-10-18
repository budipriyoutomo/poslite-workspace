"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { useCategories, useProducts } from "@/features/menu";
import { useOutlets } from "@/features/outlets";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { FormField, selectClass } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import { type Promotion, useSavePromotion } from "../application/use-promotions";
import { DAYS, fromDaysOfWeek, toDaysOfWeek } from "../domain/days";
import { CheckList } from "./CheckList";

const int = (text: string) => (/^\d+$/.test(text) ? Number(text) : null);
const digits = (text: string) => text.replace(/\D/g, "").slice(0, 3);

export function PromotionForm({ promotion, onDone }: { promotion?: Promotion; onDone: () => void }) {
  const categories = useCategories();
  const products = useProducts();
  const outlets = useOutlets();
  const save = useSavePromotion();
  const [name, setName] = useState(promotion?.name ?? "");
  const [type, setType] = useState(promotion?.type ?? "percent_off");
  const [percentage, setPercentage] = useState(String(promotion?.percentage ?? ""));
  const [buy, setBuy] = useState(String(promotion?.buy_qty ?? ""));
  const [get, setGet] = useState(String(promotion?.get_qty ?? ""));
  const [categoryIds, setCategoryIds] = useState(promotion?.category_ids ?? []);
  const [productIds, setProductIds] = useState(promotion?.product_ids ?? []);
  const [outletIds, setOutletIds] = useState(promotion?.outlet_ids ?? []);
  const [days, setDays] = useState(fromDaysOfWeek(promotion?.days_of_week ?? []));
  const [start, setStart] = useState(promotion?.start_time ?? "");
  const [end, setEnd] = useState(promotion?.end_time ?? "");
  const [startsOn, setStartsOn] = useState(promotion?.starts_on ?? "");
  const [endsOn, setEndsOn] = useState(promotion?.ends_on ?? "");

  const isPercent = type === "percent_off";
  const pct = int(percentage);
  const rule = isPercent ? pct !== null && pct >= 1 && pct <= 100 : (int(buy) ?? 0) > 0 && (int(get) ?? 0) > 0 && categoryIds.length + productIds.length > 0;
  const canSave = name.trim() !== "" && rule && days.length > 0 && Boolean(start) === Boolean(end) && (!startsOn || !endsOn || startsOn <= endsOn);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const body = {
      name: name.trim(),
      type,
      percentage: isPercent ? pct : null,
      buy_qty: isPercent ? null : int(buy),
      get_qty: isPercent ? null : int(get),
      product_ids: productIds,
      category_ids: categoryIds,
      outlet_ids: outletIds,
      days_of_week: toDaysOfWeek(days),
      start_time: start || null,
      end_time: end || null,
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      is_active: promotion?.is_active ?? true,
    };
    save.mutate({ id: promotion?.id, body }, { onSuccess: () => (toast.success("Promo disimpan"), onDone()), onError: () => toast.error("Gagal menyimpan promo") });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField id="promo-name" label="Nama promo">
        <Input id="promo-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <FormField id="promo-type" label="Jenis promo">
          <select id="promo-type" className={selectClass} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="percent_off">Diskon persen</option>
            <option value="buy_x_get_y">Beli X gratis Y</option>
          </select>
        </FormField>
        {isPercent ? (
          <FormField id="promo-pct" label="Diskon (%)">
            <Input id="promo-pct" inputMode="numeric" value={percentage} onChange={(e) => setPercentage(digits(e.target.value))} aria-invalid={percentage !== "" && !rule} />
          </FormField>
        ) : (
          <>
            <FormField id="promo-buy" label="Beli">
              <Input id="promo-buy" inputMode="numeric" value={buy} onChange={(e) => setBuy(digits(e.target.value))} />
            </FormField>
            <FormField id="promo-get" label="Gratis">
              <Input id="promo-get" inputMode="numeric" value={get} onChange={(e) => setGet(digits(e.target.value))} />
            </FormField>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {isPercent ? "Tanpa kategori/produk dipilih = berlaku untuk semua menu." : "Beli X gratis Y berlaku per baris (produk & pilihan yang sama); wajib pilih produk atau kategori."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckList legend="Kategori" prefix="Kategori" items={categories.data ?? []} selected={categoryIds} onChange={setCategoryIds} />
        <CheckList legend="Produk" prefix="Produk" items={products.data ?? []} selected={productIds} onChange={setProductIds} />
      </div>
      <CheckList legend="Outlet (kosong = semua outlet)" prefix="Outlet" items={outlets.data ?? []} selected={outletIds} onChange={setOutletIds} />
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">Hari</legend>
        <div className="flex flex-wrap gap-x-3 gap-y-2">
          {DAYS.map((d) => (
            <label key={d.value} className="flex items-center gap-1 text-sm">
              <Checkbox aria-label={d.label} checked={days.includes(d.value)} onCheckedChange={(on) => setDays((all) => (on ? [...all, d.value] : all.filter((x) => x !== d.value)))} />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FormField id="promo-start" label="Jam mulai">
          <Input id="promo-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </FormField>
        <FormField id="promo-end" label="Jam selesai">
          <Input id="promo-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </FormField>
        <FormField id="promo-from" label="Mulai tanggal">
          <Input id="promo-from" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </FormField>
        <FormField id="promo-to" label="Sampai tanggal">
          <Input id="promo-to" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </FormField>
      </div>
      <p className="text-xs text-muted-foreground">Jam mengikuti zona waktu outlet. Jam selesai lebih kecil dari jam mulai = melewati tengah malam.</p>
      <Button type="submit" className="w-full" disabled={!canSave || save.isPending}>
        Simpan
      </Button>
    </form>
  );
}
