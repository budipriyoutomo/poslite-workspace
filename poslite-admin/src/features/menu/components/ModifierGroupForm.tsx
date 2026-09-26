"use client";

import { Plus, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { RupiahInput } from "@/shared/ui/rupiah-input";

import { type ModifierGroup, useSaveModifierGroup } from "../application/use-menu";
import { FormField } from "./FormField";

type Rule = "required-one" | "optional";
interface OptionDraft {
  id?: string;
  name: string;
  price: number | null;
}

/** "Wajib pilih 1" = radio on the POS (min 1, max 1); "Opsional" = checkboxes up to a maximum. */
export function ModifierGroupForm({ group, onDone }: { group?: ModifierGroup; onDone: () => void }) {
  const save = useSaveModifierGroup();
  const [name, setName] = useState(group?.name ?? "");
  const [rule, setRule] = useState<Rule>(group && group.min_select === 1 && group.max_select === 1 ? "required-one" : "optional");
  const [maxSelect, setMaxSelect] = useState(group?.max_select ?? 3);
  const [options, setOptions] = useState<OptionDraft[]>(group?.options.map((o) => ({ ...o })) ?? [{ name: "", price: null }]);
  const filled = options.filter((o) => o.name.trim() !== "");
  const canSave = name.trim() !== "" && filled.length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const [min, max] = rule === "required-one" ? [1, 1] : [0, Math.max(1, maxSelect)];
    const body = { name: name.trim(), min_select: min, max_select: max, options: filled.map((o) => ({ ...(o.id ? { id: o.id } : {}), name: o.name.trim(), price: o.price ?? 0 })) };
    save.mutate({ id: group?.id, body }, { onSuccess: () => (toast.success("Grup pilihan disimpan"), onDone()), onError: () => toast.error("Gagal menyimpan") });
  };

  const setOption = (i: number, patch: Partial<OptionDraft>) => setOptions((all) => all.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormField id="group-name" label="Nama grup">
        <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Level Gula" />
      </FormField>
      <fieldset className="flex gap-4 text-sm">
        <legend className="mb-1 text-sm font-medium">Aturan</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="rule" checked={rule === "required-one"} onChange={() => setRule("required-one")} /> Wajib pilih 1
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="rule" checked={rule === "optional"} onChange={() => setRule("optional")} /> Opsional, maks
          <Input type="number" min={1} max={20} aria-label="Maksimum pilihan" className="h-8 w-16" value={maxSelect} disabled={rule !== "optional"} onChange={(e) => setMaxSelect(Number(e.target.value))} />
        </label>
      </fieldset>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={i} className="grid grid-cols-[1fr_9rem_auto] gap-2">
            <Input aria-label={`Pilihan ${i + 1}`} value={o.name} onChange={(e) => setOption(i, { name: e.target.value })} />
            <RupiahInput aria-label={`Harga pilihan ${i + 1}`} value={o.price} onValueChange={(price) => setOption(i, { price })} placeholder="0" />
            <Button type="button" variant="ghost" size="icon" aria-label={`Hapus pilihan ${i + 1}`} disabled={options.length === 1} onClick={() => setOptions((all) => all.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setOptions((all) => [...all, { name: "", price: null }])}>
          <Plus /> Tambah pilihan
        </Button>
      </div>
      <Button type="submit" className="w-full" disabled={!canSave || save.isPending}>
        Simpan
      </Button>
    </form>
  );
}
