import type { Product } from "@/components/ProductCard";
import type { Stall } from "@/components/StallCard";

type VariantRow = { id: string; label: string; price: number; stock: number };

type ProductRow = {
  id: string;
  name: string;
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

export type ArtistWithProducts = ArtistRow & { products: ProductRow[] };

// Shared select fragment so the landing page's flat product list and the
// stall page's nested `artists.products` query stay in sync.
export const PRODUCT_SELECT =
  "id, name, category, image_url, is_bestseller, is_one_off, sold_count, sort_order, drop_ends_at, product_variants(id, label, price, stock)";

export function formatPriceLabel(variants: VariantRow[]): string {
  if (variants.length === 0) return "";
  const min = Math.min(...variants.map((v) => v.price));
  const formatted = `Rs. ${min.toLocaleString("en-US")}`;
  return variants.length > 1 ? `from ${formatted}` : formatted;
}

export function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url ?? undefined,
    priceLabel: formatPriceLabel(row.product_variants),
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
