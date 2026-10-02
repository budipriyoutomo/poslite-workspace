"use client";

import { ImageOff, Search } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import type { ProductRow } from "@/shared/db";
import { mediaUrl } from "@/shared/media";
import { formatRupiah } from "@/shared/money";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/ui/utils";

import type { Catalog } from "../application/use-catalog";
import { copy } from "../copy";

export function ProductGrid({ catalog, onSelect }: { catalog: Catalog; onSelect: (product: ProductRow) => void }) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const products = catalog.products.filter((p) => (!categoryId || p.categoryId === categoryId) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {[{ id: null, name: copy.all }, ...catalog.categories].map((c) => (
          <button
            key={c.id ?? "all"}
            type="button"
            aria-pressed={categoryId === c.id}
            onClick={() => setCategoryId(c.id)}
            className={cn("rounded-full border px-4 py-1.5 text-sm font-medium", categoryId === c.id ? "border-emerald-600 bg-emerald-600 text-white" : "bg-white hover:bg-slate-100")}
          >
            {c.name}
          </button>
        ))}
        <div className="relative ml-auto w-full sm:w-56">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input aria-label={copy.search} placeholder={copy.search} value={query} onChange={(e) => setQuery(e.target.value)} className="bg-white pl-8" />
        </div>
      </div>
      {products.length === 0 && <p className="py-10 text-center text-muted-foreground">{copy.empty}</p>}
      <ul className="grid auto-rows-min grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 xl:grid-cols-4">
        {products.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              disabled={!p.isAvailable}
              onClick={() => onSelect(p)}
              className="flex w-full flex-col overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:border-emerald-500 hover:shadow-md active:scale-[0.98] disabled:opacity-50"
            >
              <div className="relative flex aspect-[4/3] items-center justify-center bg-slate-100">
                {/* unoptimized: the image optimizer needs the server, product photos must load offline. */}
                <ProductPhoto src={mediaUrl(catalog.mediaBaseUrl, p.imageKey)} />
              </div>
              <div className="p-3">
                <p className="line-clamp-2 leading-tight font-semibold">{p.name}</p>
                <p className="mt-1 text-sm font-medium text-emerald-700">{p.isAvailable ? formatRupiah(p.price) : copy.unavailable}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProductPhoto({ src }: { src: string | null }) {
  return src ? <Image src={src} alt="" fill unoptimized sizes="25vw" className="object-cover" /> : <ImageOff className="size-8 text-slate-300" />;
}
