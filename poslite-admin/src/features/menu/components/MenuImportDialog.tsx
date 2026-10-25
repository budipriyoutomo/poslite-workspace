"use client";

import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { useApi } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";

import { downloadMenuTemplate, useMenuImport } from "../application/use-menu";

type Counts = { create: number; update: number };
type Result = { errors: { sheet: string; row: number; message: string }[]; categories: Counts; modifier_groups: Counts; products: Counts; channel_prices: number; outlet_prices: number; applied: boolean };

const counts = (label: string, c: Counts) => `${label}: ${c.create} baru, ${c.update} diperbarui`;

/** Menu import (P1-4): download the template, check the filled file, then import it in one go. */
export function MenuImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const api = useApi();
  const importMenu = useMenuImport();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState(false);

  const check = () => file && importMenu.mutate({ file, dryRun: true }, { onSuccess: (r) => setPreview(r as Result), onError: () => toast.error("File tidak bisa dibaca") });
  const run = () => file && importMenu.mutate({ file, dryRun: false }, { onSuccess: (r) => setDone((r as Result).applied), onError: () => toast.error("Import gagal") });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import menu dari Excel</DialogTitle>
          <DialogDescription>Isi template, periksa, lalu import. Semua baris masuk sekaligus, atau tidak ada sama sekali bila ada yang salah.</DialogDescription>
        </DialogHeader>
        <Button variant="outline" onClick={() => void downloadMenuTemplate(api).catch(() => toast.error("Unduh template gagal"))}>
          <FileSpreadsheet /> Unduh template
        </Button>
        <div className="space-y-1">
          <Label htmlFor="menu-file">File menu (.xlsx)</Label>
          <Input
            id="menu-file"
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setDone(false);
            }}
          />
        </div>
        {done ? (
          <p role="status" className="text-sm font-medium text-success">
            Menu berhasil diimport
          </p>
        ) : preview ? (
          preview.errors.length > 0 ? (
            <ul role="alert" className="max-h-48 space-y-1 overflow-y-auto rounded-md bg-destructive/10 p-2 text-sm">
              {preview.errors.map((e, i) => (
                <li key={i}>{`${e.sheet} baris ${e.row}: ${e.message}`}</li>
              ))}
            </ul>
          ) : (
            <div className="space-y-2 text-sm">
              <ul>
                <li>{counts("Kategori", preview.categories)}</li>
                <li>{counts("Grup pilihan", preview.modifier_groups)}</li>
                <li>{counts("Produk", preview.products)}</li>
                <li>{`Harga channel: ${preview.channel_prices} · Harga outlet: ${preview.outlet_prices}`}</li>
              </ul>
              <Button className="w-full" disabled={importMenu.isPending} onClick={run}>
                Import menu
              </Button>
            </div>
          )
        ) : (
          <Button disabled={!file || importMenu.isPending} onClick={check}>
            Periksa file
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
