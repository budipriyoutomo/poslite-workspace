"use client";

import { type FormEvent, useState } from "react";

import type { DiningTableRow } from "@/shared/db";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

import { copy } from "../copy";

interface Props {
  tables: DiningTableRow[];
  occupiedTableIds: string[];
  onPick: (table: { tableId: string | null; tableLabel: string }) => void;
  onClose: () => void;
}

/** Tables from the back-office; an occupied table already has an open bill on this device. */
export function TablePicker({ tables, occupiedTableIds, onPick, onClose }: Props) {
  const [label, setLabel] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (label.trim()) onPick({ tableId: null, tableLabel: label.trim() });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.pickTable}</DialogTitle>
        </DialogHeader>
        {tables.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {tables.map((t) => {
              const isOccupied = occupiedTableIds.includes(t.id);
              return (
                <Button key={t.id} variant="outline" className="h-16 flex-col" disabled={isOccupied} onClick={() => onPick({ tableId: t.id, tableLabel: t.label })}>
                  <span className="text-lg font-bold">{t.label}</span>
                  <span className="text-xs text-muted-foreground">{isOccupied ? copy.occupied : t.area}</span>
                </Button>
              );
            })}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-2">
            <p className="text-sm text-muted-foreground">{copy.noTables}</p>
            <Label htmlFor="table-label">{copy.tableNumber}</Label>
            <div className="flex gap-2">
              <Input id="table-label" value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} />
              <Button type="submit" disabled={!label.trim()}>
                {copy.use}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
