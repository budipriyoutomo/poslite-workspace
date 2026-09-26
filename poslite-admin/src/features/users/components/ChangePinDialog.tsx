"use client";

import { KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { EditDialog } from "@/shared/ui/edit-dialog";
import { FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import { isValidPin, type User, useChangePin } from "../application/use-users";

/** Devices get the new PIN hash on their next pull; the old PIN keeps working offline until then. */
export function ChangePinDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const change = useChangePin();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidPin(pin)) return;
    change.mutate(
      { id: user.id, pin },
      { onSuccess: () => (toast.success(`PIN ${user.name} diganti`), setOpen(false), setPin("")), onError: () => toast.error("Gagal mengganti PIN") },
    );
  };

  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Ganti PIN ${user.name}`} onClick={() => setOpen(true)}>
        <KeyRound />
      </Button>
      <EditDialog title={`Ganti PIN ${user.name}`} open={open} onOpenChange={setOpen}>
        <form onSubmit={submit} className="space-y-4">
          <FormField id="new-pin" label="PIN baru">
            <Input id="new-pin" inputMode="numeric" autoComplete="off" placeholder="4–6 angka" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </FormField>
          <Button type="submit" className="w-full" disabled={!isValidPin(pin) || change.isPending}>
            Simpan PIN
          </Button>
        </form>
      </EditDialog>
    </>
  );
}
