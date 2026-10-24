"use client";

import { ImageOff, Search, SearchX, UtensilsCrossed } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import type { ProductRow } from "@/shared/db";
import { mediaUrl } from "@/shared/media";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { Input } from "@/shared/ui/input";
import { cn } from "@/shared/ui/utils";

import type { Catalog } from "../application/use-catalog";
import { copy } from "../copy";

// Columns follow the space the grid gets (rail and cart panel vary by device), not the viewport.
const gridClass = "grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3";

interface Props {
  catalog: Catalog;
  /** Units of each product already in the order, by product id. */
  quantities?: Record<string, number>;
  onSelect: (product: ProductRow) => void;
  /** Long press: mark the item sold out or available again (P1-2); absent = not allowed. */
  onManage?: (product: ProductRow) => void;
}

export function ProductGrid({ catalog, quantities = {}, onSelect, onManage }: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const products = catalog.products.filter((p) => (!categoryId || p.categoryId === categoryId) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)));

  if (catalog.products.length === 0) return <EmptyState icon={UtensilsCrossed} title={copy.noMenu} hint={copy.noMenuHint} />;
  return (
    <div className="@container flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      {/* Search sits beside the chips only when the grid itself is wide enough, whatever the viewport. */}
      <div className="flex flex-col gap-2 @xl:flex-row-reverse @xl:items-center">
        <div className="relative @xl:w-56 @xl:shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label={copy.search} placeholder={copy.search} value={query} onChange={(e) => setQuery(e.target.value)} className="bg-card pl-8" />
        </div>
        <div className="no-scrollbar -mx-3 flex min-w-0 flex-1 gap-2 overflow-x-auto px-3 sm:-mx-4 sm:px-4 @xl:mx-0 @xl:px-0">
          {[{ id: null, name: copy.all }, ...catalog.categories].map((c) => (
            <button
              key={c.id ?? "all"}
              type="button"
              aria-pressed={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors pointer-coarse:min-h-11",
                categoryId === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>
      {products.length === 0 ? (
        <EmptyState icon={SearchX} title={copy.empty}>
          {q && (
            <Button variant="outline" onClick={() => setQuery("")}>
              {copy.clearSearch}
            </Button>
          )}
        </EmptyState>
      ) : (
        <ul className={cn(gridClass, "overflow-y-auto")}>
          {products.map((p) => (
            // A long press opens the context menu on touch screens; the card itself may be disabled.
            <li
              key={p.id}
              onContextMenu={(e) => {
                if (!onManage) return;
                e.preventDefault();
                onManage(p);
              }}
            >
              <ProductCard catalog={catalog} product={p} quantity={quantities[p.id] ?? 0} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductCard({ catalog, product: p, quantity, onSelect }: { catalog: Catalog; product: ProductRow; quantity: number; onSelect: (p: ProductRow) => void }) {
  const select = () => {
    navigator.vibrate?.(10); // a short tick on phones that support it, so a tap feels registered
    onSelect(p);
  };
  return (
    <button
      type="button"
      disabled={!p.isAvailable}
      onClick={select}
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition hover:border-primary hover:shadow-md active:scale-[0.97] disabled:opacity-50",
        quantity > 0 && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="relative flex aspect-[4/3] w-full items-center justify-center bg-muted">
        {/* unoptimized: the image optimizer needs the server, product photos must load offline. */}
        <ProductPhoto src={mediaUrl(catalog.mediaBaseUrl, p.imageKey)} />
        {quantity > 0 && (
          // Keyed by quantity so the badge pops on every add.
          <span key={quantity} aria-hidden className="absolute top-2 right-2 flex size-7 animate-in items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-md zoom-in-50 duration-200">
            {quantity}
          </span>
        )}
      </div>
      <div className="flex w-full flex-col gap-1 p-3">
        <p className="line-clamp-2 leading-tight font-semibold">{p.name}</p>
        <p className="text-base font-bold text-primary">{p.isAvailable ? formatRupiah(p.price) : copy.unavailable}</p>
        {quantity > 0 && <span className="sr-only">{copy.inOrder(quantity)}</span>}
      </div>
    </button>
  );
}

function ProductPhoto({ src }: { src: string | null }) {
  return src ? <Image src={src} alt="" fill unoptimized sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" /> : <ImageOff className="size-8 text-muted-foreground/40" />;
}

/** Placeholder cards while the catalog loads from IndexedDB. */
export function ProductGridSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
      <div className="flex gap-2">
        {[16, 24, 20].map((w) => (
          <div key={w} className="h-9 animate-pulse rounded-full bg-muted" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <div className={gridClass}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
