"use client";

import { FileText, ImageOff, Minus, Plus, ShoppingBag, Trash2, UserRound } from "lucide-react";
import { clearCart, setLineQuantity } from "@/lib/actions";
import type { Cart } from "@/lib/db";
import { formatMoney, lineTotal } from "@/lib/utils";
import { usePos } from "../pos-context";
import { Button, EmptyState } from "../ui";
import { CartTabs } from "./cart-tabs";

export function CartPanel({
  carts,
  cart,
  onCheckout,
}: {
  carts: Cart[];
  cart: Cart | undefined;
  onCheckout: (mode: "order" | "invoice") => void;
}) {
  const { db, session } = usePos();
  const currency = session.currencyCode;
  const subtotal = cart ? lineTotal(cart.lines) : 0;
  const units = cart?.lines.reduce((n, l) => n + l.quantity, 0) ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <CartTabs carts={carts} activeId={cart?.id} />

      {!cart || cart.lines.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={<ShoppingBag />}
            title="Cart is empty"
            description="Tap a product to add it. Open another tab to serve the next customer at the same time."
          />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 pt-3 pb-1 text-xs text-muted-foreground">
            <span>
              {units} item{units === 1 ? "" : "s"}
              {cart.customer && (
                <span className="ml-2 inline-flex items-center gap-1 text-subtle-foreground">
                  <UserRound className="size-3.5" />
                  {cart.customer.firstName} {cart.customer.lastName}
                </span>
              )}
            </span>
            <button
              onClick={() => window.confirm("Remove all items from this cart?") && clearCart(db, cart.id)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-background hover:text-destructive"
            >
              <Trash2 className="size-3.5" /> Clear
            </button>
          </div>

          <ul className="scrollbar-thin min-h-0 flex-1 divide-y overflow-y-auto px-4">
            {cart.lines.map((line) => (
              <li key={line.variantId} className="flex gap-3 py-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background text-muted-foreground">
                  {line.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={line.image} alt="" className="size-full object-cover" />
                  ) : (
                    <ImageOff className="size-4 opacity-50" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[line.variantLabel, formatMoney(line.unitPrice, currency)].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center rounded-lg border">
                      <button
                        className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground"
                        onClick={() => setLineQuantity(db, cart.id, line.variantId, line.quantity - 1)}
                        aria-label={line.quantity === 1 ? "Remove" : "Decrease"}
                      >
                        {line.quantity === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}
                      </button>
                      <input
                        value={line.quantity}
                        inputMode="numeric"
                        onChange={(e) => {
                          const q = parseInt(e.target.value.replace(/\D/g, ""), 10);
                          if (!Number.isNaN(q)) void setLineQuantity(db, cart.id, line.variantId, q);
                        }}
                        className="w-9 bg-transparent text-center text-sm font-semibold tabular-nums outline-none"
                        aria-label="Quantity"
                      />
                      <button
                        className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground"
                        onClick={() => setLineQuantity(db, cart.id, line.variantId, line.quantity + 1)}
                        aria-label="Increase"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney(line.unitPrice * line.quantity, currency)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="space-y-3 border-t px-4 py-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-lg font-semibold tabular-nums">{formatMoney(subtotal, currency)}</span>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button variant="secondary" size="lg" onClick={() => onCheckout("invoice")} title="Create an invoice for this cart">
                <FileText /> Invoice
              </Button>
              <Button size="lg" onClick={() => onCheckout("order")}>
                Checkout · {formatMoney(subtotal, currency)}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
