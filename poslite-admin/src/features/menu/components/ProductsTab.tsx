"use client";

import { Pencil, Plus } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { formatRupiah } from "@/shared/money";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ConfirmDelete } from "@/shared/ui/confirm-delete";
import { EditDialog } from "@/shared/ui/edit-dialog";

import { type Product, useCategories, useDeleteProduct, useProducts } from "../application/use-menu";
import { ProductForm } from "./ProductForm";

export function ProductsTab() {
  const products = useProducts();
  const categories = useCategories();
  const remove = useDeleteProduct();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const categoryName = new Map(categories.data?.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setEditing("new")} disabled={!categories.data?.length}>
        <Plus /> Tambah produk
      </Button>
      {categories.data?.length === 0 && <p className="text-sm text-muted-foreground">Buat kategori dulu sebelum menambah produk.</p>}
      <table aria-label="Produk" className="w-full rounded-lg border bg-white text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">Nama</th>
            <th className="px-3 py-2 font-medium">SKU</th>
            <th className="px-3 py-2 font-medium">Kategori</th>
            <th className="px-3 py-2 text-right font-medium">Harga dasar</th>
            <th className="w-24" />
          </tr>
        </thead>
        <tbody>
          {products.data?.map((p) => (
            <tr key={p.id} className="border-b last:border-0">
              <td className="px-3 py-2 font-medium">
                <span className="flex items-center gap-2">
                  {p.image_url ? (
                    <Image src={p.image_url} alt={`Gambar ${p.name}`} width={32} height={32} unoptimized className="size-8 rounded object-cover" />
                  ) : (
                    <span className="size-8 rounded bg-slate-100" />
                  )}
                  {p.name} {!p.is_available && <Badge variant="secondary">Habis</Badge>}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{p.sku}</td>
              <td className="px-3 py-2">{categoryName.get(p.category_id) ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(p.price)}</td>
              <td className="px-3 py-2 text-right">
                <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${p.name}`} onClick={() => setEditing(p)}>
                  <Pencil />
                </Button>
                <ConfirmDelete name={p.name} onConfirm={() => remove.mutate(p.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <EditDialog title={editing === "new" ? "Produk baru" : "Ubah produk"} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <ProductForm product={editing === "new" || editing === null ? undefined : editing} onDone={() => setEditing(null)} />
      </EditDialog>
    </div>
  );
}
