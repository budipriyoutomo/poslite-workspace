"use client";

import { FileUp } from "lucide-react";

import { ApiError } from "@/shared/api";
import { buttonVariants } from "@/shared/ui/button";
import { cn } from "@/shared/ui/utils";

import { useImportExport, useImports } from "../application/use-outlet-admin";

const ERRORS: Record<string, string> = {
  EXPORT_INVALID: "Ini bukan file export POSLite",
  EXPORT_CHECKSUM_MISMATCH: "File rusak atau sudah diubah",
  EXPORT_WRONG_TENANT: "File ini milik perusahaan lain",
  EXPORT_DEVICE_UNKNOWN: "Perangkat di file ini tidak dikenal untuk outlet tersebut",
  OUTLET_FORBIDDEN: "Anda tidak berhak mengimpor untuk outlet ini",
};

const time = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("id-ID") : "—");

/**
 * A tablet that cannot sync exports its unsent transactions to a file (ADR-024); importing it
 * here sends them as that tablet would. The same file twice changes nothing.
 */
export function ImportPanel() {
  const importFile = useImportExport();
  const result = importFile.data;
  const history = useImports(result?.device_id ?? null);
  const error = importFile.error instanceof ApiError ? (ERRORS[importFile.error.code] ?? importFile.error.message) : importFile.error && "Gagal mengimpor file";

  return (
    <section className="space-y-3 rounded-xl border bg-white p-4">
      <div>
        <h2 className="font-semibold">Import data darurat</h2>
        <p className="text-sm text-muted-foreground">Untuk tablet yang tidak bisa sinkron (rusak, dicabut, lama offline): pilih file dari menu Sync → Export data darurat di tablet.</p>
      </div>
      <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer has-disabled:pointer-events-none has-disabled:opacity-50")}>
        <FileUp /> {importFile.isPending ? "Mengimpor…" : "Pilih file export"}
        <input
          type="file"
          accept="application/json,.json"
          aria-label="File export darurat"
          className="sr-only"
          disabled={importFile.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importFile.mutate(file);
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <section aria-label="Hasil import" className="space-y-2 rounded-md bg-slate-50 p-3 text-sm">
          <p className="font-medium">
            {result.accepted} diterima · {result.duplicate} sudah ada · {result.flagged} ditandai · {result.rejected.length} ditolak
          </p>
          {result.rejected.length > 0 && (
            <ul className="space-y-1">
              {result.rejected.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 font-mono text-xs">
                  <span>{r.id}</span>
                  <span className="text-destructive">{r.code}</span>
                </li>
              ))}
            </ul>
          )}
          {history.data && history.data.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Riwayat import perangkat ini: {history.data.map((h) => `${time(h.created_at)} (${h.accepted} diterima)`).join(" · ")}
            </p>
          )}
        </section>
      )}
    </section>
  );
}
