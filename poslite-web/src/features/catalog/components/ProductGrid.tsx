"use client";

import { Search, SearchX, UtensilsCrossed } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import type { MenuView, ProductRow } from "@/shared/db";
import { mediaUrl } from "@/shared/media";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { Input } from "@/shared/ui/input";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { cn } from "@/shared/ui/utils";

import type { Catalog } from "../application/use-catalog";
import { copy } from "../copy";
import { categoryTone, initials, type Tone } from "../domain/menu-tile";

// Columns follow the space the grid gets (rail and cart panel vary by device), not the viewport.
const gridClass = "grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3";
// Compact (15 · UX-06): text tiles, five across beside the cart on a tablet.
const compactGridClass = "grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-2";

const STRIP: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  lime: "bg-lime-500",
  orange: "bg-orange-500",
  cyan: "bg-cyan-500",
  neutral: "bg-muted-foreground/40",
};

interface Props {
  catalog: Catalog;
  /** Units of each product already in the order, by product id. */
  quantities?: Record<string, number>;
  /** Compact text tiles (the default) or photos (15 · UX-06). */
  view?: MenuView;
  /** A manager switches the view; absent = the switch is hidden. */
  onViewChange?: (view: MenuView) => void;
  onSelect: (product: ProductRow) => void;
  /** Long press: mark the item sold out or available again (P1-2); absent = not allowed. */
  onManage?: (product: ProductRow) => void;
}

export function ProductGrid({ catalog, quantities = {}, view = "compact", onViewChange, onSelect, onManage }: Props) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const products = catalog.products.filter((p) => (!categoryId || p.categoryId === categoryId) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)));

  const categoryIds = catalog.categories.map((c) => c.id);
  const toneOf = (p: ProductRow) => categoryTone(categoryIds, p.categoryId);

  if (catalog.products.length === 0) return <EmptyState icon={UtensilsCrossed} title={copy.noMenu} hint={copy.noMenuHint} />;
  return (
    <div className="@container flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      {/* Search sits beside the chips only when the grid itself is wide enough, whatever the viewport. */}
      <div className="flex flex-col gap-2 @xl:flex-row-reverse @xl:items-center">
        {onViewChange && (
          <SegmentedControl
            label={copy.view}
            value={view}
            onChange={onViewChange}
            options={[
              { value: "compact", label: copy.compact },
              { value: "photo", label: copy.photo },
            ]}
            className="@xl:shrink-0 [&_button]:min-h-9 [&_button]:px-3"
          />
        )}
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
        <ul className={cn(view === "compact" ? compactGridClass : gridClass, "overflow-y-auto")}>
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
              {view === "compact" ? (
                <ProductTile product={p} tone={toneOf(p)} quantity={quantities[p.id] ?? 0} onSelect={onSelect} />
              ) : (
                <ProductCard catalog={catalog} product={p} tone={toneOf(p)} quantity={quantities[p.id] ?? 0} onSelect={onSelect} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CardProps = { product: ProductRow; tone: Tone; quantity: number; onSelect: (p: ProductRow) => void };

function tap(p: ProductRow, onSelect: (p: ProductRow) => void) {
  navigator.vibrate?.(10); // a short tick on phones that support it, so a tap feels registered
  onSelect(p);
}

function QuantityBadge({ quantity, className }: { quantity: number; className?: string }) {
  // Keyed by quantity so the badge pops on every add.
  return (
    <span key={quantity} aria-hidden className={cn("absolute flex size-7 animate-in items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-md zoom-in-50 duration-200", className)}>
      {quantity}
    </span>
  );
}

/** Compact tile (15 · UX-06): the category's colour strip, the name and the price. */
function ProductTile({ product: p, tone, quantity, onSelect }: CardProps) {
  return (
    <button
      type="button"
      data-tone={tone}
      disabled={!p.isAvailable}
      onClick={() => tap(p, onSelect)}
      className={cn(
        "relative flex min-h-18 w-full flex-col overflow-hidden rounded-lg border bg-card py-2 pr-2 pl-3.5 text-left shadow-xs transition hover:border-primary active:scale-[0.97] disabled:bg-muted disabled:opacity-60",
        quantity > 0 && "border-primary ring-1 ring-primary",
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", STRIP[tone])} />
      <span className={cn("line-clamp-2 text-sm leading-tight font-semibold", quantity > 0 && "pr-6")}>{p.name}</span>
      <span className={cn("mt-auto pt-1 text-sm font-bold", p.isAvailable ? "text-primary" : "text-muted-foreground")}>{p.isAvailable ? formatRupiah(p.price) : copy.unavailable}</span>
      {quantity > 0 && <QuantityBadge quantity={quantity} className="top-1 right-1 size-6 text-xs" />}
      {quantity > 0 && <span className="sr-only">{copy.inOrder(quantity)}</span>}
    </button>
  );
}

function ProductCard({ catalog, product: p, tone, quantity, onSelect }: CardProps & { catalog: Catalog }) {
  const select = () => tap(p, onSelect);
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
        <ProductPhoto src={mediaUrl(catalog.mediaBaseUrl, p.imageKey)} name={p.name} tone={tone} />
        {quantity > 0 && <QuantityBadge quantity={quantity} className="top-2 right-2" />}
      </div>
      <div className="flex w-full flex-col gap-1 p-3">
        <p className="line-clamp-2 leading-tight font-semibold">{p.name}</p>
        <p className="text-base font-bold text-primary">{p.isAvailable ? formatRupiah(p.price) : copy.unavailable}</p>
        {quantity > 0 && <span className="sr-only">{copy.inOrder(quantity)}</span>}
      </div>
    </button>
  );
}

/** The photo, or the category's colour with the item's initials (15 · UX-06), never a broken image. */
function ProductPhoto({ src, name, tone }: { src: string | null; name: string; tone: Tone }) {
  if (src) return <Image src={src} alt="" fill unoptimized sizes="(min-width: 768px) 25vw, 50vw" className="object-cover" />;
  return (
    <span aria-hidden className={cn("flex size-full items-center justify-center text-3xl font-bold text-white/90", STRIP[tone])}>
      {initials(name)}
    </span>
  );
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
