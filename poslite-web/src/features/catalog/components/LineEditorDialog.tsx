"use client";

import { useState } from "react";

import type { ModifierGroupRow, ProductRow } from "@/shared/db";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Label } from "@/shared/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/radio-group";
import { Textarea } from "@/shared/ui/textarea";

import { copy } from "../copy";
import { toggleOption, validateSelection } from "../domain/modifier-selection";

export interface LineChoice {
  modifiers: { optionId: string; groupId: string; name: string; price: number }[];
  note: string;
}

interface Props {
  open: boolean;
  product: ProductRow;
  groups: ModifierGroupRow[];
  /** Present when editing an existing cart line. */
  initial?: { optionIds: string[]; note: string };
  onConfirm: (choice: LineChoice) => void;
  onOpenChange: (open: boolean) => void;
}

export function LineEditorDialog({ open, onOpenChange, ...props }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileSheet className="max-h-[90dvh] overflow-y-auto sm:max-w-md">{open && <EditorBody {...props} />}</DialogContent>
    </Dialog>
  );
}

function EditorBody({ product, groups, initial, onConfirm }: Omit<Props, "open" | "onOpenChange">) {
  const [selected, setSelected] = useState<string[]>(initial?.optionIds ?? []);
  const [note, setNote] = useState(initial?.note ?? "");
  const isValid = validateSelection(groups, selected).length === 0;
  const choices = groups.flatMap((g) => g.options.filter((o) => selected.includes(o.id)).map((o) => ({ optionId: o.id, groupId: g.id, name: o.name, price: o.price })));
  const unitPrice = product.price + choices.reduce((sum, c) => sum + c.price, 0);
  const toggle = (optionId: string) => setSelected((s) => toggleOption(groups, s, optionId));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{product.name}</DialogTitle>
        <DialogDescription>{formatRupiah(product.price)}</DialogDescription>
      </DialogHeader>
      {groups.map((group) => (
        <fieldset key={group.id} className="space-y-2">
          <legend className="text-sm font-semibold">
            {group.name} <span className="font-normal text-muted-foreground">{copy.groupRule(group.minSelect, group.maxSelect)}</span>
          </legend>
          {group.minSelect === 1 && group.maxSelect === 1 ? (
            <RadioGroup value={group.options.find((o) => selected.includes(o.id))?.id ?? ""} onValueChange={toggle}>
              {group.options.map((o) => (
                <OptionRow key={o.id} id={`opt-${o.id}`} name={o.name} price={o.price}>
                  <RadioGroupItem id={`opt-${o.id}`} value={o.id} />
                </OptionRow>
              ))}
            </RadioGroup>
          ) : (
            group.options.map((o) => (
              <OptionRow key={o.id} id={`opt-${o.id}`} name={o.name} price={o.price}>
                <Checkbox id={`opt-${o.id}`} checked={selected.includes(o.id)} onCheckedChange={() => toggle(o.id)} />
              </OptionRow>
            ))
          )}
        </fieldset>
      ))}
      <div className="space-y-2">
        <Label htmlFor="line-note">{copy.note}</Label>
        <Textarea id="line-note" value={note} maxLength={200} placeholder={copy.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
      </div>
      <DialogFooter>
        <Button className="h-11 w-full" disabled={!isValid} onClick={() => onConfirm({ modifiers: choices, note: note.trim() })}>
          {initial ? copy.save : copy.add} · {formatRupiah(unitPrice)}
        </Button>
      </DialogFooter>
    </>
  );
}

function OptionRow({ id, name, price, children }: { id: string; name: string; price: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-md border px-3 py-2">
      {children}
      <Label htmlFor={id} className="flex-1 font-normal">
        {name}
      </Label>
      {price > 0 && <span className="text-sm text-muted-foreground">+{formatRupiah(price)}</span>}
    </div>
  );
}
