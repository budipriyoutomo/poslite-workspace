"use client";

import { History, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { useAccess } from "@/features/auth";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { ConfirmDelete } from "@/shared/ui/confirm-delete";
import { Input } from "@/shared/ui/input";

import { EVENT_TYPES, useCreateWebhook, useDeleteWebhook, useWebhooks } from "../application/use-webhooks";
import { DeliveriesTable } from "./DeliveriesTable";

export function IntegrationsScreen() {
  const webhooks = useWebhooks();
  const create = useCreateWebhook();
  const remove = useDeleteWebhook();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["order.placed"]);
  const brands = useAccess().data?.brands ?? []; // company page: every brand of the company
  const [brandIds, setBrandIds] = useState<string[]>([]); // none = all brands
  const brandNames = (ids: string[]) => (ids.length === 0 ? "Semua brand" : ids.map((id) => brands.find((b) => b.id === id)?.name ?? "—").join(", "));
  const [secret, setSecret] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      { url: url.trim(), event_types: events as (typeof EVENT_TYPES)[number][], brand_ids: brandIds },
      { onSuccess: (created) => (setSecret(created.secret), setUrl("")), onError: () => toast.error("URL tidak valid (wajib https)") },
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Integrasi</h1>
        <p className="text-sm text-muted-foreground">
          Kirim transaksi ke sistem lain (inventory, ERP) lewat webhook. Setiap kiriman ditandatangani HMAC-SHA256 di header <code>X-Poslite-Signature</code> dan diulang otomatis bila gagal.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-2 rounded-lg border bg-card p-4">
        <Input aria-label="URL webhook" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {EVENT_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 font-mono">
              <Checkbox aria-label={t} checked={events.includes(t)} onCheckedChange={(on) => setEvents((all) => (on ? [...all, t] : all.filter((x) => x !== t)))} />
              {t}
            </label>
          ))}
          {brands.length > 1 &&
            brands.map((b) => (
              <label key={b.id} className="flex items-center gap-2">
                <Checkbox aria-label={`Brand ${b.name}`} checked={brandIds.includes(b.id)} onCheckedChange={(on) => setBrandIds((all) => (on ? [...all, b.id] : all.filter((x) => x !== b.id)))} />
                {b.name}
              </label>
            ))}
          <Button type="submit" size="sm" className="ml-auto" disabled={!url.trim() || events.length === 0 || create.isPending}>
            <Plus /> Tambah webhook
          </Button>
        </div>
        {secret && (
          <p role="status" className="rounded-md bg-amber-50 p-2 text-sm">
            Simpan secret ini sekarang — tidak akan ditampilkan lagi: <code className="font-mono select-all">{secret}</code>
          </p>
        )}
      </form>
      <ul className="space-y-2">
        {webhooks.data?.map((w) => (
          <li key={w.id} className="space-y-2 rounded-lg border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate font-mono text-sm">{w.url}</span>
              <span className="text-xs text-muted-foreground">{w.event_types.join(", ")}</span>
              <span className="text-xs text-muted-foreground">{brandNames(w.brand_ids)}</span>
              <Button size="icon-sm" variant="ghost" aria-label={`Riwayat ${w.url}`} onClick={() => setOpen(open === w.id ? null : w.id)}>
                <History />
              </Button>
              <ConfirmDelete name={w.url} onConfirm={() => remove.mutate(w.id)} />
            </div>
            {open === w.id && <DeliveriesTable endpointId={w.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
