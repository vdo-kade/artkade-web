// Per-browser view history for the product detail page's "Recently viewed"
// panel -- localStorage rather than a cookie/DB table since this is purely
// a client-side convenience (nothing server-rendered depends on it, and it
// shouldn't survive across devices).

export type ViewedProduct = {
  productId: string;
  slug: string;
  stallSlug: string;
  name: string;
  imageUrl?: string;
};

const STORAGE_KEY = "artkade-recently-viewed";
const MAX_ENTRIES = 12;

export function getRecentlyViewed(): ViewedProduct[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Most-recently-viewed first; re-viewing a product moves it back to the
// front instead of leaving a stale duplicate further down the list.
export function recordView(product: ViewedProduct): void {
  try {
    const existing = getRecentlyViewed().filter((p) => p.productId !== product.productId);
    const next = [product, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // corrupt/blocked storage -- viewing still works, it just won't be recorded
  }
}
