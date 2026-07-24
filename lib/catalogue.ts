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
  "id, artist_id, name, slug, category, image_url, is_bestseller, is_one_off, sold_count, sort_order, drop_ends_at, product_variants(id, label, price, stock, edition_size)";

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
  return {
    id: row.id,
    artistId: row.artist_id,
    slug: row.slug,
    stallSlug,
    name: row.name,
    imageUrl: row.image_url ?? undefined,
    priceLabel: formatPriceLabel(row.product_variants),
    sizeLabel: formatSizeLabel(row.category, row.product_variants),
    stockRemaining: row.product_variants.reduce((sum, v) => sum + v.stock, 0),
    isBestseller: row.is_bestseller,
    isOneOff: row.is_one_off,
    soldCount: row.sold_count,
    dropEndsAt: row.drop_ends_at ?? undefined,
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
  product_variants: VariantRow[];
  product_images: { url: string; sort_order: number }[];
  artists: { slug: string; name: string; is_active: boolean } | null;
};

const PRODUCT_DETAIL_SELECT =
  "id, name, slug, description, category, image_url, is_one_off, sold_count, drop_ends_at, product_variants(id, label, price, stock, edition_size), product_images(url, sort_order), artists(slug, name, is_active)";

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
  };
}
