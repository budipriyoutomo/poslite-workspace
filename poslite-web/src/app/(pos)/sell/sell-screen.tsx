"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CartLines, useCart } from "@/features/cart";
import { LineEditorDialog, type LineChoice, ProductGrid, useCatalog } from "@/features/catalog";
import { OrderSummary, useCartTotals } from "@/features/checkout";
import type { ProductRow } from "@/shared/db";
import { useOutletSetting } from "@/shared/hooks";
import { formatRupiah } from "@/shared/money";
import { Button } from "@/shared/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/sheet";

type Editing = { product: ProductRow; lineKey?: string };

/** Sell screen: composes catalog (left), cart and totals (right; a sheet on narrow screens). */
export function SellScreen() {
  const catalog = useCatalog();
  const outlet = useOutletSetting();
  const cart = useCart();
  const rates = { serviceBps: outlet?.serviceBps ?? 0, taxBps: outlet?.taxBps ?? 0 };
  const totals = useCartTotals(rates);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  if (!catalog) return null;
  const groupsOf = (p: ProductRow) => p.modifierGroupIds.flatMap((id) => catalog.groupsById.get(id) ?? []);
  const categoryName = (p: ProductRow) => catalog.categoryNameById.get(p.categoryId) ?? "";

  const select = (product: ProductRow) => {
    if (groupsOf(product).length > 0) return setEditing({ product });
    cart.add({ productId: product.id, name: product.name, categoryName: categoryName(product), unitPrice: product.price, modifiers: [], note: "" });
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
    else cart.add({ productId: product.id, name: product.name, categoryName: categoryName(product), unitPrice: product.price, modifiers, note });
    setEditing(null);
  };
  const editingLine = editing?.lineKey ? cart.lines.find((l) => l.key === editing.lineKey) : undefined;
  const itemCount = cart.lines.reduce((n, l) => n + l.quantity, 0);

  const cartPanel = (
    <div className="flex min-h-0 flex-1 flex-col">
      <CartLines onEdit={editLine} />
      <OrderSummary rates={rates}>
        <Button asChild size="lg" className="h-12 w-full bg-emerald-600 text-base hover:bg-emerald-700" disabled={totals.isEmpty}>
          <Link href="/checkout" aria-disabled={totals.isEmpty} onClick={(e) => totals.isEmpty && e.preventDefault()}>
            Bayar · {formatRupiah(totals.total)}
          </Link>
        </Button>
      </OrderSummary>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ProductGrid catalog={catalog} onSelect={select} />
      <aside className="hidden w-96 flex-col border-l bg-white p-4 lg:flex">
        <h2 className="mb-2 text-lg font-semibold">Pesanan</h2>
        {cartPanel}
      </aside>
      <Button className="fixed right-4 bottom-4 h-14 gap-2 rounded-full bg-emerald-600 px-5 shadow-lg hover:bg-emerald-700 lg:hidden" onClick={() => setIsCartOpen(true)}>
        <ShoppingCart /> {itemCount} · {formatRupiah(totals.total)}
      </Button>
      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
        <SheetContent className="flex w-full flex-col p-4 sm:max-w-md">
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
