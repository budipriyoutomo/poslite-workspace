"use client";

import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ConfirmDelete } from "@/shared/ui/confirm-delete";
import { selectClass } from "@/shared/ui/form-field";

import { type CategoryIn, useCategories, useDeleteCategory, useSaveCategory } from "../application/use-menu";

const PRINT_ROLES: { value: CategoryIn["print_role"]; label: string }[] = [
  { value: "receipt", label: "Struk" },
  { value: "kitchen", label: "Dapur" },
  { value: "bar", label: "Bar" },
];

export function CategoriesTab() {
  const categories = useCategories();
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const [name, setName] = useState("");

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    save.mutate({ body: { name: name.trim(), sort_order: categories.data?.length ?? 0, color: "", print_role: "receipt" } }, { onSuccess: () => setName(""), onError: () => toast.error("Gagal menyimpan") });
  };

  return (
    <div className="max-w-2xl space-y-3">
      <form onSubmit={add} className="flex gap-2">
        <Input aria-label="Nama kategori baru" placeholder="Nama kategori" value={name} onChange={(e) => setName(e.target.value)} className="bg-white" />
        <Button type="submit" size="sm" disabled={!name.trim()}>
          <Plus /> Tambah
        </Button>
      </form>
      <ul className="divide-y rounded-lg border bg-white">
        {categories.data?.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-3 py-2">
            <span className="flex-1 font-medium">{c.name}</span>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Cetak ke
              <select
                className={`${selectClass} w-28`}
                value={c.print_role}
                onChange={(e) => save.mutate({ id: c.id, body: { ...c, print_role: e.target.value as CategoryIn["print_role"] } })}
              >
                {PRINT_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <ConfirmDelete name={c.name} onConfirm={() => remove.mutate(c.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
