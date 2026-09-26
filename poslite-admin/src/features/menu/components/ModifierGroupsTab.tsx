"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";

import { type ModifierGroup, useDeleteModifierGroup, useModifierGroups } from "../application/use-menu";
import { ConfirmDelete } from "@/shared/ui/confirm-delete";
import { EditDialog } from "@/shared/ui/edit-dialog";
import { ModifierGroupForm } from "./ModifierGroupForm";

const rule = (g: ModifierGroup) => (g.min_select === 1 && g.max_select === 1 ? "Wajib pilih 1" : `Opsional, maks ${g.max_select}`);

export function ModifierGroupsTab() {
  const groups = useModifierGroups();
  const remove = useDeleteModifierGroup();
  const [editing, setEditing] = useState<ModifierGroup | "new" | null>(null);

  return (
    <div className="max-w-3xl space-y-3">
      <Button size="sm" onClick={() => setEditing("new")}>
        <Plus /> Tambah grup pilihan
      </Button>
      <ul className="divide-y rounded-lg border bg-white">
        {groups.data?.map((g) => (
          <li key={g.id} className="flex items-start gap-3 px-3 py-3">
            <div className="flex-1">
              <p className="font-medium">
                {g.name} <span className="text-sm font-normal text-muted-foreground">· {rule(g)}</span>
              </p>
              <p className="text-sm text-muted-foreground">{g.options.map((o) => (o.price ? `${o.name} (+${formatRupiah(o.price)})` : o.name)).join(", ")}</p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${g.name}`} onClick={() => setEditing(g)}>
              <Pencil />
            </Button>
            <ConfirmDelete name={g.name} onConfirm={() => remove.mutate(g.id)} />
          </li>
        ))}
      </ul>
      <EditDialog title={editing === "new" ? "Grup pilihan baru" : "Ubah grup pilihan"} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <ModifierGroupForm group={editing === "new" || editing === null ? undefined : editing} onDone={() => setEditing(null)} />
      </EditDialog>
    </div>
  );
}
