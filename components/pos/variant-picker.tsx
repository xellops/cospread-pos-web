"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import type { CachedProduct } from "@/lib/db";
import { sortedVariants, variantLabel, variantStock } from "@/lib/products";
import type { ProductVariant } from "@/lib/types";
import { cn, formatMoney } from "@/lib/utils";
import { usePos } from "../pos-context";
import { Badge, Button, Modal } from "../ui";

export function VariantPicker({
  product,
  onClose,
  onAdd,
}: {
  product: CachedProduct;
  onClose: () => void;
  onAdd: (variant: ProductVariant, quantity: number) => void;
}) {
  const { session } = usePos();
  const variants = sortedVariants(product);
  const [selected, setSelected] = useState(variants[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const variant = variants.find((v) => v.id === selected);

  return (
    <Modal
      open
      onClose={onClose}
      title={product.name}
      description={product.sku ? `SKU ${product.sku}` : product.tagline ?? undefined}
      footer={
        <>
          <div className="mr-auto flex items-center gap-1 rounded-lg border">
            <Button variant="ghost" size="icon" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease">
              <Minus />
            </Button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums">{quantity}</span>
            <Button variant="ghost" size="icon" onClick={() => setQuantity((q) => q + 1)} aria-label="Increase">
              <Plus />
            </Button>
          </div>
          <Button disabled={!variant} onClick={() => variant && onAdd(variant, quantity)}>
            Add · {formatMoney((variant?.price ?? 0) * quantity, session.currencyCode)}
          </Button>
        </>
      }
    >
      <div className="space-y-2" role="radiogroup" aria-label="Options">
        {variants.map((v, i) => {
          const stock = variantStock(product, v, session.activeLocationId);
          return (
            <button
              key={v.id}
              role="radio"
              aria-checked={selected === v.id}
              onClick={() => setSelected(v.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left",
                selected === v.id && "border-brand bg-brand-soft/60 ring-1 ring-brand",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{variantLabel(v) ?? `Option ${i + 1}`}</p>
                <div className="mt-1 flex gap-1">
                  {v.isDefault && <Badge tone="brand">Default</Badge>}
                  {stock !== null && (
                    <Badge tone={stock > 0 ? "neutral" : "danger"}>{stock > 0 ? `${stock} in stock` : "Out of stock"}</Badge>
                  )}
                </div>
              </div>
              <span className="text-sm font-semibold">{formatMoney(v.price, session.currencyCode)}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
