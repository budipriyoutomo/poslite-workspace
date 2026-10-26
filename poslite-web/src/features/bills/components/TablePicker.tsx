"use client";

import { type FormEvent, useState } from "react";

import type { DiningTableRow, OpenBillRow } from "@/shared/db";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

import { copy } from "../copy";
import { areasOf, tableTiles } from "../domain/table-status";
import { TableBoard } from "./TableBoard";

interface Props {
  tables: DiningTableRow[];
  /** Bills on the tables: their tables show their status and cannot be picked. */
  bills: OpenBillRow[];
  totalOf?: (bill: OpenBillRow) => number;
  onPick: (table: { tableId: string | null; tableLabel: string }) => void;
  onClose: () => void;
}

/** The table screen's grid as a dialog (15 · UX-04): pick a free table from the back-office's list. */
export function TablePicker({ tables, bills, totalOf, onPick, onClose }: Props) {
  const [label, setLabel] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (label.trim()) onPick({ tableId: null, tableLabel: label.trim() });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent mobileSheet className="max-h-dvh overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{copy.pickTable}</DialogTitle>
        </DialogHeader>
        {tables.length > 0 ? (
          <TableBoard
            tiles={tableTiles(tables, bills, new Date()).filter((t) => t.tableId !== null && tables.some((x) => x.id === t.tableId))}
            areas={areasOf(tables)}
            totalOf={totalOf}
            isPicking
            onSelect={(t) => onPick({ tableId: t.tableId, tableLabel: t.label })}
          />
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
