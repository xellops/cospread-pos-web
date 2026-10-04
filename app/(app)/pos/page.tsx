"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ShoppingCart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Catalog } from "@/components/pos/catalog";
import { CartPanel } from "@/components/pos/cart-panel";
import { CheckoutDialog } from "@/components/pos/checkout-dialog";
import { VariantPicker } from "@/components/pos/variant-picker";
import { usePos } from "@/components/pos-context";
import { ACTIVE_CART_KEY, addToCart, createCart } from "@/lib/actions";
import { getMeta, type CachedProduct } from "@/lib/db";
import { productImage, sortedVariants, variantLabel } from "@/lib/products";
import type { ProductVariant } from "@/lib/types";
import { cn, formatMoney, lineTotal } from "@/lib/utils";

export default function PosPage() {
  const { db, session } = usePos();
  const carts = useLiveQuery(() => db.carts.orderBy("position").toArray(), [db]);
  const activeId = useLiveQuery(() => getMeta<string>(db, ACTIVE_CART_KEY), [db]);
  const [picking, setPicking] = useState<CachedProduct | null>(null);
  const [checkout, setCheckout] = useState<"order" | "invoice" | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const cart = carts?.find((c) => c.id === activeId) ?? carts?.[0];

  // Always keep at least one cart open (the ref stops a double create in dev Strict Mode).
  const creating = useRef(false);
  useEffect(() => {
    if (!carts || carts.length > 0 || creating.current) return;
    creating.current = true;
    void createCart(db).finally(() => {
      creating.current = false;
    });
  }, [carts, db]);

  async function add(product: CachedProduct, variant: ProductVariant, quantity = 1) {
    if (!cart) return;
    await addToCart(
      db,
      cart.id,
      {
        variantId: variant.id,
        productId: product.id,
        name: product.name,
        variantLabel: product.variants.length > 1 ? variantLabel(variant) : null,
        sku: product.sku,
        unitPrice: Number(variant.price) || 0,
        image: productImage(product),
      },
      quantity,
    );
    toast.success(`Added ${product.name}`, { duration: 1200, position: "bottom-center" });
  }

  function pick(product: CachedProduct) {
    const variants = sortedVariants(product);
    if (variants.length === 1) void add(product, variants[0]);
    else setPicking(product);
  }

  const units = cart?.lines.reduce((n, l) => n + l.quantity, 0) ?? 0;

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <Catalog onPick={pick} />
      </div>

      {/* Cart: a side panel on wide screens, a slide-over on phones and small tablets. */}
      <aside
        className={cn(
          "fixed inset-0 z-40 flex flex-col bg-surface lg:static lg:z-auto lg:w-[24rem] lg:border-l xl:w-[26rem]",
          cartOpen ? "flex" : "hidden lg:flex",
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-3 lg:hidden">
          <span className="text-sm font-semibold">Carts</span>
          <button onClick={() => setCartOpen(false)} className="text-sm font-medium text-brand">
            Back to products
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <CartPanel carts={carts ?? []} cart={cart} onCheckout={setCheckout} />
        </div>
      </aside>

      <button
        onClick={() => setCartOpen(true)}
        className="fixed right-4 bottom-20 z-30 flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white shadow-lg md:bottom-6 lg:hidden"
      >
        <ShoppingCart className="size-4" />
        {units} · {formatMoney(cart ? lineTotal(cart.lines) : 0, session.currencyCode)}
      </button>

      {picking && (
        <VariantPicker
          product={picking}
          onClose={() => setPicking(null)}
          onAdd={(variant, qty) => {
            void add(picking, variant, qty);
            setPicking(null);
          }}
        />
      )}
      {checkout && cart && (
        <CheckoutDialog
          cart={cart}
          mode={checkout}
          onClose={() => {
            setCheckout(null);
            setCartOpen(false);
          }}
        />
      )}
    </div>
  );
}
