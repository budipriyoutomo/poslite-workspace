"use client";

import Link from "next/link";
import { useState } from "react";

import { DineInBar } from "@/features/bills";
import { CartLines, useCart } from "@/features/cart";
import { LineEditorDialog, type LineChoice, ProductGrid, ProductGridSkeleton, useCatalog } from "@/features/catalog";
import { OrderSummary, useCartTotals } from "@/features/checkout";
import type { ProductRow } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/sheet";

import { CartBar } from "./cart-bar";

type Editing = { product: ProductRow; lineKey?: string };

/** What the cart shows under a line: the promotion's name, or the cashier's discount. */
function appliedLabel(line: { discount: { type: string; value: number } | null; promotion: { name: string } | null; amount: number }) {
  if (!line.discount) return null;
  const label = line.promotion?.name ?? (line.discount.type === "percentage" ? `Diskon ${line.discount.value}%` : "Diskon");
  return { label, amount: line.amount };
}

/** Sell screen: catalog plus the order — a side panel from tablet width, a bottom bar and drawer on phones. */
export function SellScreen() {
  const catalog = useCatalog();
  const outlet = useOutletSetting();
  const cart = useCart();
  const rates = { serviceBps: outlet?.serviceBps ?? 0, taxBps: outlet?.taxBps ?? 0 };
  const totals = useCartTotals(rates);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  if (!catalog) return <ProductGridSkeleton />;
  const groupsOf = (p: ProductRow) => p.modifierGroupIds.flatMap((id) => catalog.groupsById.get(id) ?? []);
  const categoryName = (p: ProductRow) => catalog.categoryNameById.get(p.categoryId) ?? "";

  const select = (product: ProductRow) => {
    if (groupsOf(product).length > 0) return setEditing({ product });
    cart.add({ productId: product.id, categoryId: product.categoryId, name: product.name, categoryName: categoryName(product), unitPrice: product.price, modifiers: [], note: "" });
  };
  const editLine = (key: string) => {
    const line = cart.lines.find((l) => l.key === key);
    const product = catalog.products.find((p) => p.id === line?.productId);
    if (product) setEditing({ product, lineKey: key });
  };
  const confirm = ({ modifiers, note }: LineChoice) => {
    if (!editing) return;
    const { product, lineKey } = editing;
    if (lineKey) cart.update(lineKey, { modifiers, note });
    else cart.add({ productId: product.id, categoryId: product.categoryId, name: product.name, categoryName: categoryName(product), unitPrice: product.price, modifiers, note });
    setEditing(null);
  };
  const editingLine = editing?.lineKey ? cart.lines.find((l) => l.key === editing.lineKey) : undefined;
  const itemCount = cart.lines.reduce((n, l) => n + l.quantity, 0);
  const quantities: Record<string, number> = {};
  for (const l of cart.lines) quantities[l.productId] = (quantities[l.productId] ?? 0) + l.quantity;

  const cartPanel = (
    <div className="flex min-h-0 flex-1 flex-col">
      <DineInBar />
      <CartLines onEdit={editLine} applied={totals.lines.map(appliedLabel)} />
      <OrderSummary rates={rates}>
        <Button asChild size="lg" className="h-12 w-full text-base" disabled={totals.isEmpty}>
          <Link href="/checkout" aria-disabled={totals.isEmpty} onClick={(e) => totals.isEmpty && e.preventDefault()}>
            Bayar · {formatRupiah(totals.total)}
          </Link>
        </Button>
      </OrderSummary>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <ProductGrid catalog={catalog} quantities={quantities} onSelect={select} />
      <aside className="hidden w-80 shrink-0 flex-col border-l bg-card p-4 md:flex lg:w-96">
        <h2 className="mb-2 text-lg font-semibold">Pesanan</h2>
        {cartPanel}
      </aside>
      <CartBar className="md:hidden" itemCount={itemCount} total={totals.total} onOpen={() => setIsCartOpen(true)} />
      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent side="bottom" aria-describedby={undefined} className="h-[88dvh] gap-2 rounded-t-2xl p-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <span aria-hidden className="mx-auto mb-1 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
          <SheetHeader className="p-0">
            <SheetTitle>Pesanan</SheetTitle>
          </SheetHeader>
          {cartPanel}
        </SheetContent>
      </Sheet>
      {editing && (
        <LineEditorDialog
          open
          product={editing.product}
          groups={groupsOf(editing.product)}
          initial={editingLine && { optionIds: editingLine.modifiers.map((m) => m.optionId), note: editingLine.note }}
          onConfirm={confirm}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </div>
  );
}
