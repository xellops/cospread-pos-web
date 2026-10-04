"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ImageOff, LayoutGrid, List, PackageSearch, Search, X } from "lucide-react";
import { useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import type { CachedProduct } from "@/lib/db";
import { matchesSearch, priceRange, productImage, sortedVariants, variantStock } from "@/lib/products";
import { useSyncStatus } from "@/lib/sync";
import { cn, formatMoney } from "@/lib/utils";
import { usePos } from "../pos-context";
import { Badge, EmptyState, Input, Segmented, Spinner } from "../ui";

type View = "grid" | "list";
const VIEW_KEY = "cospread-pos:catalog-view";
const viewListeners = new Set<() => void>();

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

function useCatalogView(): [View, (v: View) => void] {
  const view = useSyncExternalStore(
    (l) => {
      viewListeners.add(l);
      return () => viewListeners.delete(l);
    },
    readView,
    () => "grid" as View,
  );
  const set = (v: View) => {
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
    viewListeners.forEach((l) => l());
  };
  return [view, set];
}

function PriceLabel({ product, currency }: { product: CachedProduct; currency?: string }) {
  const [min, max] = priceRange(product);
  return (
    <span>
      {formatMoney(min, currency)}
      {max > min && <span className="text-muted-foreground"> – {formatMoney(max, currency)}</span>}
    </span>
  );
}

function StockBadge({ product, locationId }: { product: CachedProduct; locationId: string | null }) {
  if (product.type === "SERVICE") return <Badge tone="brand">Service</Badge>;
  const total = sortedVariants(product).reduce((sum, v) => sum + (variantStock(product, v, locationId) ?? 0), 0);
  if (total <= 0) return <Badge tone="danger">Out of stock</Badge>;
  if (product.stockThreshold && total <= product.stockThreshold) return <Badge tone="warning">{total} left</Badge>;
  return <Badge tone="success">{total} in stock</Badge>;
}

function Thumb({ product, className }: { product: CachedProduct; className?: string }) {
  const src = productImage(product);
  const [broken, setBroken] = useState(false);
  return (
    <div className={cn("flex items-center justify-center overflow-hidden bg-background text-muted-foreground", className)}>
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="size-full object-cover" />
      ) : (
        <ImageOff className="size-5 opacity-50" />
      )}
    </div>
  );
}

export function Catalog({ onPick }: { onPick: (product: CachedProduct) => void }) {
  const { db, session } = usePos();
  const sync = useSyncStatus();
  const [view, setView] = useCatalogView();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const products = useLiveQuery(() => db.products.orderBy("name").toArray(), [db]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products ?? []) if (p.category) map.set(p.category.id, p.category.name);
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [products]);

  const visible = useMemo(() => {
    let list = products ?? [];
    if (category) list = list.filter((p) => p.category?.id === category);
    if (deferredQuery.trim()) list = list.filter((p) => matchesSearch(p, deferredQuery));
    return list.filter((p) => p.variants?.length);
  }, [products, category, deferredQuery]);

  const currency = session.currencyCode;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b bg-surface px-3 py-3 sm:px-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, description or SKU"
              className="pr-9 pl-9"
              aria-label="Search products"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-background"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "grid", label: <LayoutGrid />, title: "Card view" },
              { value: "list", label: <List />, title: "List view" },
            ]}
          />
        </div>
        {categories.length > 1 && (
          <div className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {[[null, "All"] as const, ...categories].map(([id, name]) => (
              <button
                key={id ?? "all"}
                onClick={() => setCategory(id)}
                className={cn(
                  "h-7 shrink-0 rounded-full border px-3 text-xs font-medium text-subtle-foreground",
                  category === id && "border-brand bg-brand-soft text-brand",
                )}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
        {products === undefined ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : products.length === 0 ? (
          sync.syncing ? (
            <EmptyState icon={<Spinner />} title="Downloading products…" description="They'll stay available offline." />
          ) : (
            <EmptyState
              icon={<PackageSearch />}
              title="No products yet"
              description={
                sync.online
                  ? "Published products from your CoSpread dashboard will appear here."
                  : "Connect to the internet once to download your product catalog."
              }
            />
          )
        ) : visible.length === 0 ? (
          <EmptyState icon={<Search />} title="No matching products" description={`Nothing matches “${deferredQuery}”.`} />
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
            {visible.map((p) => (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                className="group flex flex-col overflow-hidden rounded-xl border bg-surface text-left transition-shadow hover:border-brand/40 hover:shadow-md"
              >
                <Thumb product={p} className="aspect-[4/3] w-full" />
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <p className="line-clamp-2 text-sm leading-snug font-medium">{p.name}</p>
                  {p.sku && <p className="truncate text-[11px] text-muted-foreground">SKU {p.sku}</p>}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-1 pt-1">
                    <span className="text-sm font-semibold">
                      <PriceLabel product={p} currency={currency} />
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <StockBadge product={p} locationId={session.activeLocationId} />
                    {p.variants.length > 1 && <Badge>{p.variants.length} options</Badge>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="divide-y overflow-hidden rounded-xl border bg-surface">
            {visible.map((p) => (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-background"
              >
                <Thumb product={p} className="size-12 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[p.sku && `SKU ${p.sku}`, p.category?.name, p.variants.length > 1 && `${p.variants.length} options`]
                      .filter(Boolean)
                      .join(" · ") || p.description}
                  </p>
                </div>
                <div className="hidden sm:block">
                  <StockBadge product={p} locationId={session.activeLocationId} />
                </div>
                <span className="shrink-0 text-right text-sm font-semibold">
                  <PriceLabel product={p} currency={currency} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
