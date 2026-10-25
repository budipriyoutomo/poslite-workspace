"use client";

import { Pencil, Plus, Tags } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/shared/ui/button";
import { ConfirmDelete } from "@/shared/ui/confirm-delete";
import { EditDialog } from "@/shared/ui/edit-dialog";
import { Switch } from "@/shared/ui/switch";

import { type Channel, type ChannelIn, useChannels, useDeleteChannel, useSaveChannel } from "../application/use-channels";
import { describePricing, KIND_LABEL } from "../domain/describe";
import { ChannelForm } from "./ChannelForm";
import { ChannelPrices } from "./ChannelPrices";

function toBody(channel: Channel): ChannelIn {
  const body: Partial<Channel> = { ...channel };
  delete body.id;
  delete body.prices;
  return body as ChannelIn;
}

/** Where sales come from and how each is priced (ADR-029): dine-in, take-away, delivery apps. */
export function ChannelsScreen() {
  const channels = useChannels();
  const save = useSaveChannel();
  const remove = useDeleteChannel();
  const [editing, setEditing] = useState<Channel | "new" | null>(null);
  const [pricing, setPricing] = useState<Channel | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Channel penjualan</h1>
          <p className="text-sm text-muted-foreground">Kasir memilih channel sebelum mencatat pesanan; harga, service, dan PB1 mengikuti channel. Laporan memisahkan penjualan per channel.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Tambah channel
        </Button>
      </div>
      <ul className="divide-y rounded-lg border bg-card">
        {channels.data?.map((c) => (
          <li key={c.id} aria-label={c.name} className="flex items-center gap-3 px-3 py-2">
            <div className="flex-1">
              <p className="font-medium">{c.name}</p>
              <p className="text-sm text-muted-foreground">{`${KIND_LABEL[c.kind]} · ${describePricing(c)}`}</p>
            </div>
            {c.price_mode === "price_list" && (
              <Button variant="outline" size="sm" aria-label={`Harga ${c.name}`} onClick={() => setPricing(c)}>
                <Tags /> Harga
              </Button>
            )}
            <Switch
              aria-label={`Aktif ${c.name}`}
              checked={c.is_active}
              onCheckedChange={(on) => save.mutate({ id: c.id, body: { ...toBody(c), is_active: on } }, { onError: () => toast.error("Gagal menyimpan") })}
            />
            <Button variant="ghost" size="icon-sm" aria-label={`Ubah ${c.name}`} onClick={() => setEditing(c)}>
              <Pencil />
            </Button>
            <ConfirmDelete name={c.name} onConfirm={() => remove.mutate(c.id, { onError: () => toast.error("Gagal menghapus") })} />
          </li>
        ))}
      </ul>
      <EditDialog title={editing === "new" ? "Channel baru" : "Ubah channel"} open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <ChannelForm channel={editing === "new" || editing === null ? undefined : editing} onDone={() => setEditing(null)} />
      </EditDialog>
      <EditDialog title={pricing ? `Harga ${pricing.name}` : ""} open={pricing !== null} onOpenChange={(o) => !o && setPricing(null)}>
        {pricing && <ChannelPrices channel={pricing} onDone={() => setPricing(null)} />}
      </EditDialog>
    </div>
  );
}
