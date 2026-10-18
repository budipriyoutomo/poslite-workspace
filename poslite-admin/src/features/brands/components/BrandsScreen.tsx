"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { ApiError } from "@/shared/api";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ConfirmDelete } from "@/shared/ui/confirm-delete";
import { EditDialog } from "@/shared/ui/edit-dialog";
import { TableFrame } from "@/shared/ui/table-frame";

import { type Brand, useBrands, useDeleteBrand } from "../application/use-brands";
import { BrandForm } from "./BrandForm";

const DELETE_ERRORS: Record<string, string> = { BRAND_HAS_OUTLETS: "Tutup atau pindahkan outlet brand ini dulu" };

export function BrandsScreen() {
  const brands = useBrands();
  const remove = useDeleteBrand();
  const [editing, setEditing] = useState<Brand | "new" | null>(null);
  const deleteError = remove.error instanceof ApiError ? (DELETE_ERRORS[remove.error.code] ?? remove.error.message) : remove.error && "Gagal menghapus";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Brand</h1>
          <p className="text-sm text-muted-foreground">Setiap brand punya menu, promo, dan outlet sendiri.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Tambah brand
        </Button>
      </div>
      {deleteError && (
        <p role="alert" className="text-sm text-destructive">
          {deleteError}
        </p>
      )}
      <TableFrame>
        <table aria-label="Brand" className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Kode</th>
              <th className="px-3 py-2 font-medium">Nama</th>
              <th className="px-3 py-2 font-medium">Header struk</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {brands.data?.map((b) => (
              <tr key={b.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono">{b.code}</td>
                <td className="px-3 py-2 font-medium">
                  {b.name} {!b.is_active && <Badge variant="secondary">Nonaktif</Badge>}
                </td>
                <td className="px-3 py-2 whitespace-pre-line text-muted-foreground">{b.receipt_header || "—"}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${b.name}`} onClick={() => setEditing(b)}>
                    <Pencil />
                  </Button>
                  <ConfirmDelete name={b.name} onConfirm={() => remove.mutate(b.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
      <EditDialog title={editing === "new" ? "Brand baru" : "Ubah brand"} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <BrandForm brand={editing === "new" || editing === null ? undefined : editing} onDone={() => setEditing(null)} />
      </EditDialog>
    </div>
  );
}
