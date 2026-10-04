"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { closeCart, createCart, renameCart, ACTIVE_CART_KEY } from "@/lib/actions";
import { setMeta, type Cart } from "@/lib/db";
import { cn } from "@/lib/utils";
import { usePos } from "../pos-context";

/** Browser-style tabs: one cart per customer being served. Double-click a tab to rename it. */
export function CartTabs({ carts, activeId }: { carts: Cart[]; activeId: string | undefined }) {
  const { db } = usePos();
  const [editing, setEditing] = useState<string | null>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  async function close(cart: Cart) {
    if (cart.lines.length && !window.confirm(`Close “${cart.name}”? Its ${cart.lines.length} item(s) will be removed.`)) return;
    await closeCart(db, cart.id);
  }

  return (
    <div className="flex items-end gap-1 border-b bg-background px-2 pt-2">
      <div className="scrollbar-hide flex min-w-0 flex-1 items-end gap-1 overflow-x-auto" role="tablist">
        {carts.map((cart) => {
          const active = cart.id === activeId;
          const count = cart.lines.reduce((n, l) => n + l.quantity, 0);
          return (
            <div
              key={cart.id}
              ref={active ? activeRef : undefined}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => setMeta(db, ACTIVE_CART_KEY, cart.id)}
              onKeyDown={(e) => e.key === "Enter" && setMeta(db, ACTIVE_CART_KEY, cart.id)}
              onDoubleClick={() => setEditing(cart.id)}
              onAuxClick={(e) => e.button === 1 && close(cart)}
              className={cn(
                "group relative flex h-9 max-w-44 min-w-28 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg border border-b-0 px-3 text-xs font-medium select-none",
                active
                  ? "-mb-px bg-surface text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-surface/60",
              )}
            >
              {editing === cart.id ? (
                <input
                  autoFocus
                  defaultValue={cart.name}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    void renameCart(db, cart.id, e.target.value);
                    setEditing(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setEditing(null);
                  }}
                  className="w-full min-w-0 bg-transparent outline-none"
                />
              ) : (
                <span className="truncate" title={`${cart.name} — double-click to rename`}>
                  {cart.name}
                </span>
              )}
              {count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] leading-4 tabular-nums",
                    active ? "bg-brand text-white" : "bg-border text-subtle-foreground",
                  )}
                >
                  {count}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  void close(cart);
                }}
                className="ml-auto rounded p-0.5 text-muted-foreground opacity-60 hover:bg-background hover:opacity-100"
                aria-label={`Close ${cart.name}`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => void createCart(db)}
        className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
        aria-label="New cart"
        title="New cart"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
