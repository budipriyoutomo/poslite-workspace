"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { useSession } from "@/features/auth";
import { DineInBar } from "@/features/bills";
import { CartLines, useCart } from "@/features/cart";
import { AvailabilityDialog, LineEditorDialog, type LineChoice, markAvailability, ProductGrid, ProductGridSkeleton, useCatalog } from "@/features/catalog";
import { ChannelPicker, OrderSummary, useCartTotals, useSaleChannel } from "@/features/checkout";
import type { ProductRow } from "@/shared/db";
import { useMediaQuery } from "@/shared/hooks";
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
  const menu = useCatalog();
  const user = useSession((s) => s.user);
  const isWaiter = user?.role === "waiter";
  // P1-2: a cashier or manager marks an item sold out with a long press; a waiter may not.
  const [managing, setManaging] = useState<ProductRow | null>(null);
  const chooseAvailability = async (choice: { isAvailable: boolean; untilEndOfDay: boolean }) => {
    if (!managing || !user) return;
    try {
      await markAvailability({ productId: managing.id, ...choice, userId: user.id });
      toast.success(choice.isAvailable ? `${managing.name} tersedia lagi` : `${managing.name} ditandai habis`);
    } catch {
      toast.error("Gagal mengubah ketersediaan");
    }
    setManaging(null);
  };
  const cart = useCart();
  const sale = useSaleChannel();
  const { rates } = sale; // the sale channel's rates (ADR-029), as placeOrder snapshots them
  const totals = useCartTotals(rates);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  // The order renders in one place only: the side panel from tablet width, a drawer on phones.
  const isWide = useMediaQuery("(min-width: 768px)", true);

  if (!menu) return <ProductGridSkeleton />;
  // Prices on the sale's channel; a price-list channel without a price does not sell the product.
  const catalog = { ...menu, products: menu.products.flatMap((p) => { const price = sale.priceOf(p); return price === null ? [] : [{ ...p, price }]; }) };
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
  // A saved bill or cleared cart leaves nothing to show: close the phone drawer with it.
  if (isCartOpen && itemCount === 0) setIsCartOpen(false);
  const quantities: Record<string, number> = {};
  for (const l of cart.lines) quantities[l.productId] = (quantities[l.productId] ?? 0) + l.quantity;

  const cartPanel = (
    <div className="flex min-h-0 flex-1 flex-col">
      {!cart.bill && (
        <ChannelPicker
          channels={sale.channels}
          activeId={sale.channel?.id ?? null}
          onChoose={(c) => cart.setChannel(c.id, sale.priceById(c)) || toast.error(`Ada menu di keranjang yang tidak dijual di ${c.name}`)}
        />
      )}
      <DineInBar />
      <CartLines onEdit={editLine} applied={totals.lines.map(appliedLabel)} />
      <OrderSummary rates={rates}>
        {/* A waiter saves the bill; the cashier takes the money (ADR-031). */}
        {!isWaiter && (
          <Button asChild size="lg" className="h-12 w-full text-base" disabled={totals.isEmpty}>
            <Link href="/checkout" aria-disabled={totals.isEmpty} onClick={(e) => totals.isEmpty && e.preventDefault()}>
              Bayar · {formatRupiah(totals.total)}
            </Link>
          </Button>
        )}
      </OrderSummary>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <ProductGrid catalog={catalog} quantities={quantities} onSelect={select} {...(user && !isWaiter && { onManage: setManaging })} />
      {managing && (
        <AvailabilityDialog productName={managing.name} isAvailable={managing.isAvailable} onChoose={(c) => void chooseAvailability(c)} onClose={() => setManaging(null)} />
      )}
      {isWide ? (
        <aside className="flex w-80 shrink-0 flex-col border-l bg-card p-4 lg:w-96">
          <h2 className="mb-2 text-lg font-semibold">Pesanan</h2>
          {cartPanel}
        </aside>
      ) : (
        <CartBar itemCount={itemCount} total={totals.total} onOpen={() => setIsCartOpen(true)} />
      )}
      <Sheet open={isCartOpen && !isWide} onOpenChange={setIsCartOpen}>
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
