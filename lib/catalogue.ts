import type { Product, ProductVariant } from "@/components/ProductCard";
import type { Stall } from "@/components/StallCard";
import { createClient } from "./supabase-server";

type VariantRow = { id: string; label: string; price: number; stock: number; edition_size: number | null };

type ProductRow = {
  id: string;
  artist_id: string;
  name: string;
  slug: string;
  category: string;
  image_url: string | null;
  is_bestseller: boolean;
  is_one_off: boolean;
  sold_count: number;
  sort_order: number;
  drop_ends_at: string | null;
  shared_stock_pool: boolean;
  is_exclusive_drop: boolean;
  product_variants: VariantRow[];
};

type ArtistRow = {
  slug: string;
  name: string;
  tagline: string | null;
  accent_color: string;
  is_popup: boolean;
  popup_ends_at: string | null;
};

export type ArtistWithProducts = ArtistRow & {
  bio: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  products: ProductRow[];
};

// Shared select fragment so the landing page's flat product list and the
// stall page's nested `artists.products` query stay in sync.
export const PRODUCT_SELECT =
  "id, artist_id, name, slug, category, image_url, is_bestseller, is_one_off, sold_count, sort_order, drop_ends_at, shared_stock_pool, is_exclusive_drop, product_variants(id, label, price, stock, edition_size)";

// Collective "N of M left" across every variant of a product -- the
// aggregate the card badge (is_exclusive_drop) and the shared-pool stock
// count both need, computed the same way so they never disagree.
//
// Shared-pool products (t-shirts) keep every sibling variant's stock and
// edition_size numerically identical by construction (see lib/stock.ts),
// so the aggregate is just that one repeated value, not a sum -- summing
// would multiply a single 50-unit pool by however many sizes exist.
// Per-variant products (prints) genuinely run independent editions, so
// there the aggregate is a real sum across whichever variants are tracked
// (edition_size != null); untracked variants (stickers, digital) don't
// contribute a "total" to sum in the first place.
export function computeEditionAggregate(
  sharedStockPool: boolean,
  variants: VariantRow[]
): { remaining: number; total: number } | undefined {
  if (sharedStockPool) {
    const pooled = variants.find((v) => v.edition_size != null);
    return pooled ? { remaining: pooled.stock, total: pooled.edition_size! } : undefined;
  }
  const tracked = variants.filter((v) => v.edition_size != null);
  if (tracked.length === 0) return undefined;
  return {
    remaining: tracked.reduce((sum, v) => sum + v.stock, 0),
    total: tracked.reduce((sum, v) => sum + v.edition_size!, 0),
  };
}

// Same shared-pool awareness as computeEditionAggregate, but for plain
// "how many units does this product have left" reporting (card fallback
// text, vendor/admin dashboard stock totals) that doesn't care about
// edition_size at all. A shared pool's sibling variants are kept
// numerically identical (see lib/stock.ts), so summing them would multiply
// one pool by however many sizes it has.
export function productStockTotal(sharedStockPool: boolean, variants: { stock: number }[]): number {
  if (!sharedStockPool) return variants.reduce((sum, v) => sum + v.stock, 0);
  return variants[0]?.stock ?? 0;
}

export function formatPriceLabel(variants: VariantRow[]): string {
  if (variants.length === 0) return "";
  const min = Math.min(...variants.map((v) => v.price));
  const formatted = `Rs. ${min.toLocaleString("en-US")}`;
  return variants.length > 1 ? `from ${formatted}` : formatted;
}

// Sticker labels carry a material suffix ("Small, sticker paper
// laminated") that belongs on the product detail page, not the card --
// only the leading size word is shown here.
function shortSizeLabel(label: string): string {
  return label.split(",")[0].trim();
}

// Card-level size hint for prints/stickers only (the two categories vendor
// beta feedback flagged as confusing with price alone) -- cheapest variant's
// size through the priciest's, e.g. "A6–A3" or "Small–Large", collapsing to
// a single tier when there's only one variant or they share a size label.
export function formatSizeLabel(category: string, variants: VariantRow[]): string | undefined {
  if (category !== "print" && category !== "sticker_pack") return undefined;
  if (variants.length === 0) return undefined;
  const sorted = [...variants].sort((a, b) => a.price - b.price);
  const min = shortSizeLabel(sorted[0].label);
  const max = shortSizeLabel(sorted[sorted.length - 1].label);
  return min === max ? min : `${min}–${max}`;
}

// stallSlug is passed in explicitly rather than selected as a nested
// `artists(slug)` on every ProductRow -- the stall page and homepage both
// already know it per-query (they fetch one stall's products at a time),
// and PostgREST rejects a second `artists(...)` embed on the same query
// where one's already needed with `!inner` (search page's is_active
// filter), so a single shared embed shape can't cleanly serve all three
// call sites. Each caller supplies the slug it already has in scope.
export function mapProduct(row: ProductRow, stallSlug: string): Product {
  const editionAggregate = computeEditionAggregate(row.shared_stock_pool, row.product_variants);
  return {
    id: row.id,
    artistId: row.artist_id,
    slug: row.slug,
    stallSlug,
    name: row.name,
    category: row.category,
    imageUrl: row.image_url ?? undefined,
    priceLabel: formatPriceLabel(row.product_variants),
    sizeLabel: formatSizeLabel(row.category, row.product_variants),
    stockRemaining: productStockTotal(row.shared_stock_pool, row.product_variants),
    isBestseller: row.is_bestseller,
    isOneOff: row.is_one_off,
    soldCount: row.sold_count,
    dropEndsAt: row.drop_ends_at ?? undefined,
    exclusiveDropStock: row.is_exclusive_drop ? editionAggregate : undefined,
    variants: row.product_variants.map((v) => ({
      id: v.id,
      label: v.label,
      price: v.price,
      stock: v.stock,
      editionSize: v.edition_size ?? undefined,
    })),
  };
}

export function mapStall(row: ArtistRow): Stall {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? "",
    accentColor: row.accent_color,
    isPopup: row.is_popup,
    popupEndsAt: row.popup_ends_at ?? undefined,
  };
}

// product_category enum order (supabase/schema.sql), used to order stall
// page sections consistently regardless of DB row order.
export const CATEGORY_LABELS: Record<string, string> = {
  sticker_pack: "Sticker box",
  print: "Print rack",
  tshirt: "T-Shirts",
  digital: "Digital",
  freebie: "Freebies",
  other: "More",
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

// Per-product type label shown on the card and detail page (e.g. "Print",
// "T-Shirt") -- distinct from CATEGORY_LABELS above, which are plural
// section headings ("Print rack", "T-Shirts") meant for a whole group of
// products, not a singular tag on one product. Two stalls each have a
// print and a t-shirt sharing the same name (Nuwan's "Fractal Theory",
// Vdokade's "Susie Splosion") with nothing on the card/detail page to
// tell them apart -- this is derived from the same category column
// CATEGORY_LABELS already reads, not a new field.
export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  sticker_pack: "Sticker",
  print: "Print",
  tshirt: "T-Shirt",
  digital: "Digital",
  freebie: "Freebie",
  other: "Other",
};

// Default display order for a stall that's never touched its category
// order setting (artists.category_order, null/empty) -- t-shirts, then
// stickers, then prints lead, with the categories most stalls don't use
// (digital/freebie/other) trailing in the same relative order they always
// had. Deliberately a separate constant from CATEGORY_ORDER above, which
// stays whatever order suits the "Category" dropdown in the product
// create/edit forms -- that ordering was never a display concern and
// doesn't need to change just because the default display order did.
export const DEFAULT_CATEGORY_ORDER = ["tshirt", "sticker_pack", "print", "digital", "freebie", "other"];

// A stall's saved category_order can predate a category it only just
// started selling in (e.g. it was set before the vendor ever added a
// t-shirt) -- resolving it here rather than trusting the saved array
// verbatim is what keeps that new category from silently vanishing off the
// stall page instead of just appending to the end.
export function resolveCategoryOrder(
  customOrder: string[] | null | undefined,
  presentCategories: string[]
): string[] {
  const base = customOrder && customOrder.length > 0 ? customOrder : DEFAULT_CATEGORY_ORDER;
  const known = base.filter((cat) => presentCategories.includes(cat));
  const missing = presentCategories.filter((cat) => !base.includes(cat));
  // Missing categories still get a deterministic relative order (by the
  // site-wide default), not DB/insertion order, so which one appends first
  // never depends on incidental row order.
  const missingOrdered = [
    ...DEFAULT_CATEGORY_ORDER.filter((cat) => missing.includes(cat)),
    ...missing.filter((cat) => !DEFAULT_CATEGORY_ORDER.includes(cat)),
  ];
  return [...known, ...missingOrdered];
}

// ---------- PRODUCT DETAIL PAGE ----------

export type ProductDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  isOneOff: boolean;
  soldCount: number;
  dropEndsAt?: string;
  images: { src: string; alt: string }[];
  variants: ProductVariant[];
  stallName: string;
  stallSlug: string;
  // Per-product sizing chart override -- see lib/sizing.ts. Null/undefined
  // means "use the site-wide default table" (SizeGuideButton handles the
  // fallback).
  sizingChartUrl?: string;
  // Set when products.shared_stock_pool is true (t-shirts) -- every sibling
  // variant shares this one figure instead of running its own edition, so
  // ProductDetail shows it once above the size list rather than repeating
  // it as a per-row EditionBadge (see computeEditionAggregate).
  sharedStock?: { remaining: number; total: number };
};

type ProductDetailRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  image_url: string | null;
  is_one_off: boolean;
  sold_count: number;
  drop_ends_at: string | null;
  sizing_chart_url: string | null;
  shared_stock_pool: boolean;
  product_variants: VariantRow[];
  product_images: { url: string; sort_order: number }[];
  artists: { slug: string; name: string; is_active: boolean } | null;
};

const PRODUCT_DETAIL_SELECT =
  "id, name, slug, description, category, image_url, is_one_off, sold_count, drop_ends_at, sizing_chart_url, shared_stock_pool, product_variants(id, label, price, stock, edition_size), product_images(url, sort_order), artists(slug, name, is_active)";

// Shared by both the real product page (app/stalls/[slug]/products/
// [productSlug]/page.tsx) and its intercepted-route modal counterpart --
// slug is globally unique, but the URL's stallSlug is still checked
// against the product's actual stall so a stale/wrong stall segment 404s
// instead of silently rendering someone else's product under it.
export async function getProductDetail(
  stallSlug: string,
  productSlug: string
): Promise<ProductDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select(PRODUCT_DETAIL_SELECT)
    .eq("slug", productSlug)
    .eq("is_active", true)
    .maybeSingle<ProductDetailRow>();

  if (!data || !data.artists || !data.artists.is_active || data.artists.slug !== stallSlug) {
    return null;
  }

  const gallery = [...data.product_images]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((img) => ({ src: img.url, alt: data.name }));

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description,
    category: data.category,
    isOneOff: data.is_one_off,
    soldCount: data.sold_count,
    dropEndsAt: data.drop_ends_at ?? undefined,
    sizingChartUrl: data.sizing_chart_url ?? undefined,
    images: gallery.length > 0 ? gallery : data.image_url ? [{ src: data.image_url, alt: data.name }] : [],
    variants: data.product_variants.map((v) => ({
      id: v.id,
      label: v.label,
      price: v.price,
      stock: v.stock,
      editionSize: v.edition_size ?? undefined,
    })),
    stallName: data.artists.name,
    stallSlug: data.artists.slug,
    sharedStock: data.shared_stock_pool
      ? computeEditionAggregate(data.shared_stock_pool, data.product_variants)
      : undefined,
  };
}
