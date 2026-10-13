"use client";

import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { ApiError } from "@/shared/api";
import { Button } from "@/shared/ui/button";
import { EditDialog } from "@/shared/ui/edit-dialog";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import { useExtendTrial } from "../application/use-tenants";
import { errorMessage } from "../domain/labels";

export function ExtendTrialDialog({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState("7");
  const extend = useExtendTrial(tenantId);
  const valid = /^\d+$/.test(days) && Number(days) >= 1 && Number(days) <= 90;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    extend.mutate(Number(days), {
      onSuccess: () => (toast.success(`Trial diperpanjang ${days} hari`), setOpen(false)),
      onError: (error) => toast.error(errorMessage(error instanceof ApiError ? error.code : undefined, "Gagal memperpanjang trial")),
    });
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Perpanjang trial
      </Button>
      <EditDialog title="Perpanjang masa coba" open={open} onOpenChange={setOpen}>
        <form onSubmit={submit} className="space-y-4">
          <FormField id="trial-days" label="Tambah hari">
            <Input id="trial-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </FormField>
          <p className="text-sm text-muted-foreground">1–90 hari, dihitung dari akhir trial saat ini.</p>
          <Button type="submit" disabled={!valid || extend.isPending}>
            Perpanjang
          </Button>
        </form>
      </EditDialog>
    </>
  );
}
