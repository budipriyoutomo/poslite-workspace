"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { ConfirmDelete } from "@/shared/ui/confirm-delete";
import { EditDialog } from "@/shared/ui/edit-dialog";
import { Switch } from "@/shared/ui/switch";

import { type Promotion, type PromotionIn, useDeletePromotion, usePromotions, useSavePromotion } from "../application/use-promotions";
import { describeRule, describeSchedule } from "../domain/describe";
import { PromotionForm } from "./PromotionForm";

function toBody(promotion: Promotion): PromotionIn {
  const body: Partial<Promotion> = { ...promotion };
  delete body.id;
  return body as PromotionIn;
}

export function PromotionsScreen() {
  const promotions = usePromotions();
  const save = useSavePromotion();
  const remove = useDeletePromotion();
  const [editing, setEditing] = useState<Promotion | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Promo</h1>
          <p className="text-sm text-muted-foreground">Muncul sebagai pilihan di layar bayar kasir (juga saat offline) dan berlaku bila dipilih kasir. Per baris dipakai diskon terbesar; diskon manual kasir menggantikan promo.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Tambah promo
        </Button>
      </div>
      {promotions.data?.length === 0 && <p className="text-sm text-muted-foreground">Belum ada promo.</p>}
      <ul className="divide-y rounded-lg border bg-white">
        {promotions.data?.map((p) => (
          <li key={p.id} aria-label={p.name} className="flex items-center gap-3 px-3 py-2">
            <div className="flex-1">
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-muted-foreground">{`${describeRule(p)} · ${describeSchedule(p)}`}</p>
            </div>
            <Switch
              aria-label={`Aktif ${p.name}`}
              checked={p.is_active}
              onCheckedChange={(on) => save.mutate({ id: p.id, body: { ...toBody(p), is_active: on } }, { onError: () => toast.error("Gagal menyimpan") })}
            />
            <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${p.name}`} onClick={() => setEditing(p)}>
              <Pencil />
            </Button>
            <ConfirmDelete name={p.name} onConfirm={() => remove.mutate(p.id, { onError: () => toast.error("Gagal menghapus") })} />
          </li>
        ))}
      </ul>
      <EditDialog title={editing === "new" ? "Promo baru" : "Ubah promo"} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <PromotionForm promotion={editing === "new" || editing === null ? undefined : editing} onDone={() => setEditing(null)} />
      </EditDialog>
    </div>
  );
}
