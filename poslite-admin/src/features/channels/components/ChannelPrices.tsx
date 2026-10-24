"use client";

import { useState } from "react";
import { toast } from "sonner";

import { useProducts } from "@/features/menu";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";

import { type Channel, useSetChannelPrices } from "../application/use-channels";

/** The whole price list of a channel; a menu left empty is not sold there (ADR-029). */
export function ChannelPrices({ channel, onDone }: { channel: Channel; onDone: () => void }) {
  const products = useProducts();
  const save = useSetChannelPrices();
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(channel.prices.map((p) => [p.product_id, String(p.price)])));

  const submit = () => {
    const list = Object.entries(prices).flatMap(([product_id, text]) => (text === "" ? [] : [{ product_id, price: Number(text) }]));
    save.mutate({ id: channel.id, prices: list }, { onSuccess: () => (toast.success("Harga disimpan"), onDone()), onError: () => toast.error("Gagal menyimpan harga") });
  };

  return (
    <div className="space-y-3">
      <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-md border">
        {(products.data ?? []).map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="flex-1">
              {p.name} <span className="text-muted-foreground">· menu {formatRupiah(p.price)}</span>
            </span>
            <Input
              aria-label={`Harga ${p.name}`}
              inputMode="numeric"
              className="w-32"
              placeholder="Tidak dijual"
              value={prices[p.id] ?? ""}
              onChange={(e) => setPrices({ ...prices, [p.id]: e.target.value.replace(/\D/g, "").slice(0, 9) })}
            />
          </li>
        ))}
      </ul>
      <Button className="w-full" disabled={save.isPending} onClick={submit}>
        Simpan harga
      </Button>
    </div>
  );
}
