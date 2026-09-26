"use client";

import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { ConfirmDelete } from "@/shared/ui/confirm-delete";
import { Input } from "@/shared/ui/input";

import { useAddTable, useDeleteTable, useTables } from "../application/use-outlet-admin";

const ERRORS: Record<string, string> = { TABLE_LABEL_TAKEN: "Label meja sudah dipakai di outlet ini" };

export function TablesPanel({ outletId }: { outletId: string }) {
  const tables = useTables(outletId);
  const add = useAddTable(outletId);
  const remove = useDeleteTable(outletId);
  const [label, setLabel] = useState("");
  const [area, setArea] = useState("");
  const [seats, setSeats] = useState("");
  const error = add.error instanceof ApiError ? (ERRORS[add.error.code] ?? add.error.message) : add.error && "Gagal menambah meja";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    const body = { label: label.trim(), area: area.trim(), seats: Number(seats || 0), sort_order: tables.data?.length ?? 0 };
    add.mutate(body, { onSuccess: () => (setLabel(""), setArea(""), setSeats("")) });
  };

  return (
    <section className="space-y-3 rounded-lg border bg-white p-4">
      <div>
        <h2 className="font-semibold">Meja</h2>
        <p className="text-xs text-muted-foreground">Dipakai kasir untuk open bill dine-in. Perangkat menerima perubahan saat sinkron berikutnya.</p>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <Input aria-label="Label meja" placeholder="A1" value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} className="w-24" />
        <Input aria-label="Area" placeholder="Area (opsional)" value={area} maxLength={50} onChange={(e) => setArea(e.target.value)} />
        <Input aria-label="Kursi" inputMode="numeric" placeholder="Kursi" value={seats} onChange={(e) => setSeats(e.target.value.replace(/\D/g, "").slice(0, 2))} className="w-20" />
        <Button type="submit" size="sm" disabled={!label.trim() || add.isPending} aria-label="Tambah meja">
          <Plus /> Tambah
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {tables.data?.length === 0 && <p className="text-sm text-muted-foreground">Belum ada meja.</p>}
      <ul className="divide-y">
        {tables.data?.map((t) => (
          <li key={t.id} aria-label={`Meja ${t.label}`} className="flex items-center gap-3 py-2">
            <span className="w-16 font-medium">{t.label}</span>
            <span className="flex-1 text-sm text-muted-foreground">{[t.area || null, t.seats ? `${t.seats} kursi` : null].filter(Boolean).join(" · ")}</span>
            <ConfirmDelete name={t.label} onConfirm={() => remove.mutate(t.id, { onError: () => toast.error("Gagal menghapus meja") })} />
          </li>
        ))}
      </ul>
    </section>
  );
}
