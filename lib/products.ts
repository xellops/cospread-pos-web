import { FILE_BASE_URL } from "./config";
import type { CachedProduct } from "./db";
import type { Product, ProductVariant } from "./types";

export function productImage(product: Product): string | null {
  const attachments = product.attachments ?? [];
  const chosen =
    attachments.find((a) => a.reference === product.defaultAttachmentReference) ??
    attachments.find((a) => a.isThumbnail) ??
    attachments[0];
  const key = chosen?.file?.key;
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  return FILE_BASE_URL ? `${FILE_BASE_URL}${key}` : null;
}

/** Variants sorted with the default first. */
export function sortedVariants(product: Product): ProductVariant[] {
  return [...(product.variants ?? [])].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export function defaultVariant(product: Product): ProductVariant | undefined {
  return sortedVariants(product)[0];
}

/** A short, human label for a variant: its description, else its specification values. */
export function variantLabel(variant: ProductVariant): string | null {
  if (variant.description?.trim()) return variant.description.trim();
  const values = Object.values(variant.specification ?? {})
    .filter((v) => typeof v === "string" || typeof v === "number")
    .map(String);
  return values.length ? values.join(" / ") : null;
}

/**
 * Units available for a variant. Prefers the per-location stock record when
 * the business tracks stock by location, else the variant's own counter.
 */
export function variantStock(
  product: Product,
  variant: ProductVariant,
  locationId: string | null,
): number | null {
  if (product.type === "SERVICE") return null;
  const stocks = (product.stocks ?? []).filter((s) => s.productVariantId === variant.id);
  if (locationId) {
    const atLocation = stocks.find((s) => s.businessLocationId === locationId);
    if (atLocation) return atLocation.quantity;
  }
  if (stocks.length) return stocks.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
  return typeof variant.stock === "number" ? variant.stock : null;
}

export function priceRange(product: Product): [number, number] {
  const prices = (product.variants ?? []).map((v) => Number(v.price) || 0);
  if (!prices.length) return [0, 0];
  return [Math.min(...prices), Math.max(...prices)];
}

export function toCachedProduct(product: Product): CachedProduct {
  const searchText = [
    product.name,
    product.tagline,
    product.description,
    product.sku,
    product.tags,
    ...(product.variants ?? []).map((v) => v.description),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return { ...product, searchText };
}

/** Every whitespace-separated term must appear somewhere in name, description or SKU. */
export function matchesSearch(product: CachedProduct, query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => product.searchText.includes(t));
}
