"use client";

import { Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { ConfirmDelete } from "@/shared/ui/confirm-delete";
import { selectClass } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";

import { OutletMatrix } from "./OutletMatrix";
import {
  METHOD_TYPES,
  type PaymentMethod,
  type PaymentMethodType,
  typeLabel,
  useDeletePaymentMethod,
  usePaymentMethods,
  useSavePaymentMethod,
} from "../application/use-payment-methods";

const toBody = ({ name, type, requires_reference, sort_order, logo_url }: PaymentMethod) => ({ name, type, requires_reference, sort_order, logo_url: logo_url ?? null });

export function PaymentMethodsScreen() {
  const methods = usePaymentMethods();
  const save = useSavePaymentMethod();
  const remove = useDeletePaymentMethod();
  const [name, setName] = useState("");
  const [type, setType] = useState<PaymentMethodType>("qris");
  const onError = () => toast.error("Gagal menyimpan");

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Non-cash payments usually carry an EDC/QRIS reference; the owner can switch it off.
    const body = { name: name.trim(), type, requires_reference: type !== "cash", sort_order: methods.data?.length ?? 0, logo_url: null };
    save.mutate({ body }, { onSuccess: () => setName(""), onError });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Metode Bayar</h1>
        <p className="text-sm text-muted-foreground">Metode baru langsung berlaku di semua outlet; atur per outlet di tabel bawah. Perangkat kasir menerima perubahan saat sinkron berikutnya.</p>
      </div>
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <Input aria-label="Nama metode baru" placeholder="mis. QRIS BCA" value={name} onChange={(e) => setName(e.target.value)} className="min-w-40 flex-1 bg-card" />
        <select aria-label="Jenis" className={`${selectClass} w-40`} value={type} onChange={(e) => setType(e.target.value as PaymentMethodType)}>
          {METHOD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={!name.trim()}>
          <Plus /> Tambah
        </Button>
      </form>
      <ul className="divide-y rounded-lg border bg-card">
        {methods.data?.map((m) => (
          <li key={m.id} aria-label={m.name} className="flex items-center gap-3 px-3 py-2">
            <span className="flex-1 font-medium">{m.name}</span>
            <span className="w-28 text-sm text-muted-foreground">{typeLabel(m.type)}</span>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch
                aria-label={`Wajib no. referensi ${m.name}`}
                checked={m.requires_reference}
                onCheckedChange={(checked) => save.mutate({ id: m.id, body: { ...toBody(m), requires_reference: checked } }, { onError })}
              />
              No. referensi
            </label>
            <ConfirmDelete name={m.name} onConfirm={() => remove.mutate(m.id, { onError: () => toast.error("Gagal menghapus") })} />
          </li>
        ))}
      </ul>
      {methods.data && <OutletMatrix methods={methods.data} />}
    </div>
  );
}
