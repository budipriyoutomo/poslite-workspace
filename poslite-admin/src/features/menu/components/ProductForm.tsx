"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { RupiahInput } from "@/shared/ui/rupiah-input";
import { Switch } from "@/shared/ui/switch";

import { type Product, useCategories, useModifierGroups, useSaveProduct } from "../application/use-menu";
import { FormField, selectClass } from "./FormField";

const ERRORS: Record<string, string> = { SKU_TAKEN: "SKU sudah dipakai produk lain" };

export function ProductForm({ product, onDone }: { product?: Product; onDone: () => void }) {
  const categories = useCategories();
  const groups = useModifierGroups();
  const save = useSaveProduct();
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [price, setPrice] = useState<number | null>(product?.price ?? null);
  const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
  const [groupIds, setGroupIds] = useState<string[]>(product?.modifier_group_ids ?? []);
  const [isAvailable, setIsAvailable] = useState(product?.is_available ?? true);
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
  const category = categoryId || categories.data?.[0]?.id || "";
  const canSave = name.trim() !== "" && sku.trim() !== "" && price !== null && category !== "";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    const body = { category_id: category, sku: sku.trim(), name: name.trim(), price, image_url: imageUrl.trim() || null, is_available: isAvailable, modifier_group_ids: groupIds };
    save.mutate(
      { id: product?.id, body },
      {
        onSuccess: () => (toast.success("Produk disimpan"), onDone()),
        onError: (err) => toast.error(err instanceof ApiError ? (ERRORS[err.code] ?? err.message) : "Gagal menyimpan"),
      },
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField id="product-name" label="Nama">
        <Input id="product-name" value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="product-sku" label="SKU">
          <Input id="product-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
        </FormField>
        <FormField id="product-price" label="Harga">
          <RupiahInput id="product-price" value={price} onValueChange={setPrice} />
        </FormField>
      </div>
      <FormField id="product-category" label="Kategori">
        <select id="product-category" className={selectClass} value={category} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="product-image" label="URL gambar (opsional)">
        <Input id="product-image" type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      </FormField>
      {groups.data && groups.data.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Pilihan / modifier</legend>
          {groups.data.map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-sm">
              <Checkbox checked={groupIds.includes(g.id)} onCheckedChange={(on) => setGroupIds((ids) => (on ? [...ids, g.id] : ids.filter((i) => i !== g.id)))} aria-label={g.name} />
              {g.name}
            </label>
          ))}
        </fieldset>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isAvailable} onCheckedChange={setIsAvailable} aria-label="Tersedia" /> Tersedia
      </label>
      <Button type="submit" className="w-full" disabled={!canSave || save.isPending}>
        Simpan
      </Button>
    </form>
  );
}
