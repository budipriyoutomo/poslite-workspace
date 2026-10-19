"use client";

import { useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { EditDialog } from "@/shared/ui/edit-dialog";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";

import { useCloseDay } from "../application/use-day-closing";
import { longDate } from "../domain/dates";

const ERRORS: Record<string, string> = {
  DAY_ALREADY_CLOSED: "Hari ini sudah ditutup.",
  DAY_NOT_ENDED: "Hari operasional belum berakhir.",
};

export function CloseDayDialog({ open, onOpenChange, outletId, businessDate, warnings }: { open: boolean; onOpenChange: (open: boolean) => void; outletId: string; businessDate: string; warnings: boolean }) {
  return (
    <EditDialog title="Tutup hari" open={open} onOpenChange={onOpenChange}>
      <CloseDayForm outletId={outletId} businessDate={businessDate} warnings={warnings} onDone={() => onOpenChange(false)} />
    </EditDialog>
  );
}

function CloseDayForm({ outletId, businessDate, warnings, onDone }: { outletId: string; businessDate: string; warnings: boolean; onDone: () => void }) {
  const close = useCloseDay();
  const [notes, setNotes] = useState("");
  const [acknowledged, setAcknowledged] = useState(!warnings);

  const submit = () =>
    close.mutate(
      { outlet_id: outletId, business_date: businessDate, notes },
      {
        onSuccess: () => {
          toast.success("Hari ditutup");
          onDone();
        },
        onError: (error) => toast.error((error instanceof ApiError && ERRORS[error.code]) || "Tutup hari gagal, coba lagi"),
      },
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Angka {longDate(businessDate)} akan dibekukan sebagai rekap harian. Data yang masuk setelahnya tetap diterima dan ditampilkan sebagai selisih.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="day-closing-notes">Catatan</Label>
        <Textarea id="day-closing-notes" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mis. setoran ke bank, selisih kas karena…" />
      </div>
      {warnings && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={acknowledged} onCheckedChange={(on) => setAcknowledged(on === true)} className="mt-0.5" />
          Saya sudah memeriksa peringatan (shift terbuka / perangkat belum sync) dan tetap ingin menutup hari.
        </label>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Batal
        </Button>
        <Button disabled={!acknowledged || close.isPending} onClick={submit}>
          Tutup hari
        </Button>
      </div>
    </div>
  );
}
