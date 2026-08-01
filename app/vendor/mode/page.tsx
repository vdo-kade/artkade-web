import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-admin";
import { getSessionRole } from "@/lib/session-role";
import { CATEGORY_LABELS, productStockTotal, resolveCategoryOrder, sortVariantsByPrice } from "@/lib/catalogue";
import EndOfDayPanel from "./EndOfDayPanel";
import VendorModeCatalogue, { type CatalogueSection, type SoldTodayEntry } from "./VendorModeCatalogue";
import AdminNav from "@/components/AdminNav";

export const revalidate = 0;

type ArtistRow = { id: string; slug: string; name: string; category_order: string[] | null };
type StallListRow = { id: string; slug: string; name: string };
type VariantRow = { id: string; label: string; price: number; stock: number };
type ProductRow = {
  id: string;
  name: string;
  category: string;
  shared_stock_pool: boolean;
  product_variants: VariantRow[];
};
type SaleRow = {
  id: string;
  product_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  notes: string | null;
  sold_at: string;
  products: { name: string } | null;
  product_variants: { label: string } | null;
};

function VendorModeError() {
  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <p>Failed to load Vendor Mode. Check the server logs for details.</p>
    </div>
  );
}

export default async function VendorModePage({ searchParams }: { searchParams: { artist?: string } }) {
  const session = await getSessionRole();
  if (!session) redirect("/admin/login");
  // Vendor Mode logs in-person sales, which decrements stock (see
  // ../mode-actions.ts) -- restricted_admin can view every dashboard and
  // fulfil orders, but not write to the catalogue, so there's nothing for
  // it to do here.
  if (session.role === "restricted_admin") redirect("/admin");

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    console.error("Failed to create admin Supabase client:", err);
    return <VendorModeError />;
  }

  let stallList: StallListRow[] = [];
  let selectedArtistId: string;

  if (session.role === "admin") {
    const { data } = await supabase.from("artists").select("id, slug, name").order("sort_order");
    stallList = data ?? [];
    if (stallList.length === 0) {
      return <div style={{ padding: 24, fontFamily: "sans-serif" }}>No stalls yet.</div>;
    }
    const requested = stallList.find((s) => s.slug === searchParams.artist);
    selectedArtistId = (requested ?? stallList[0]).id;
  } else {
    selectedArtistId = session.artistId;
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [artistResult, productsResult, todaySalesResult] = await Promise.all([
    supabase
      .from("artists")
      .select("id, slug, name, category_order")
      .eq("id", selectedArtistId)
      .maybeSingle<ArtistRow>(),
    supabase
      .from("products")
      .select("id, name, category, shared_stock_pool, product_variants(id, label, price, stock)")
      .eq("artist_id", selectedArtistId)
      .eq("is_active", true)
      .order("sort_order")
      .returns<ProductRow[]>(),
    supabase
      .from("offline_sales")
      .select("id, product_id, variant_id, quantity, unit_price, notes, sold_at, products(name), product_variants(label)")
      .eq("artist_id", selectedArtistId)
      .gte("sold_at", startOfToday.toISOString())
      .order("sold_at", { ascending: false })
      .returns<SaleRow[]>(),
  ]);

  if (artistResult.error || productsResult.error || todaySalesResult.error) {
    console.error(
      "Failed to load Vendor Mode data:",
      artistResult.error ?? productsResult.error ?? todaySalesResult.error
    );
    return <VendorModeError />;
  }

  const artist = artistResult.data;
  if (!artist) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Stall not found.</div>;
  }
  const products = productsResult.data ?? [];
  const todaySales = todaySalesResult.data ?? [];
  const todayTotal = todaySales.reduce((sum, s) => sum + s.quantity * s.unit_price, 0);

  // Same category grouping the Stock tab uses (app/vendor/page.tsx) --
  // resolveCategoryOrder respects this stall's own saved order and appends
  // any category it hasn't arranged yet, rather than a category silently
  // vanishing off this list too.
  const presentCategoryOrder = resolveCategoryOrder(
    artist.category_order,
    Array.from(new Set(products.map((p) => p.category)))
  );
  const sections: CatalogueSection[] = presentCategoryOrder.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    products: products
      .filter((p) => p.category === cat)
      .map((product) => {
        const variants = sortVariantsByPrice(product.product_variants);
        // Shared-pool products (t-shirts) keep every sibling variant's
        // stock numerically identical (see lib/stock.ts) -- repeating that
        // same number on every size row reads as "each size has this
        // much," backwards for one pool split across sizes. Computed once
        // here, same aggregate the card/detail page already use.
        const poolStock = product.shared_stock_pool ? productStockTotal(true, variants) : null;
        return { id: product.id, name: product.name, poolStock, variants };
      }),
  }));

  // Quick re-sell list pinned at the top: the distinct variants already
  // sold today (most recent first, since todaySales is already ordered
  // that way), each pointing at its live product/variant/poolStock so a
  // repeat sale at the same event doesn't need scrolling into its category
  // to find it again. Looked up against `sections` (not the sales rows
  // themselves) so the displayed stock is always the current live number,
  // not whatever it was at the moment of that earlier sale.
  const variantLookup = new Map<
    string,
    { productId: string; productName: string; poolStock: number | null; variant: VariantRow }
  >();
  for (const section of sections) {
    for (const product of section.products) {
      for (const variant of product.variants) {
        variantLookup.set(variant.id, {
          productId: product.id,
          productName: product.name,
          poolStock: product.poolStock,
          variant,
        });
      }
    }
  }
  const seenVariantIds = new Set<string>();
  const soldToday: SoldTodayEntry[] = [];
  for (const sale of todaySales) {
    if (seenVariantIds.has(sale.variant_id)) continue;
    seenVariantIds.add(sale.variant_id);
    const match = variantLookup.get(sale.variant_id);
    // Skip a variant that's since gone inactive/deleted -- can't log a
    // repeat sale against something no longer sellable, and its row would
    // have nothing live to show anyway.
    if (match) soldToday.push(match);
  }

  return (
    <>
      <AdminNav role={session.role} />
      <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 560, margin: "0 auto" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/vendor">&larr; Back to dashboard</Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>{artist.name} — Vendor Mode</h1>
      <p style={{ fontSize: 13, color: "#666", marginBottom: 24 }}>
        Tap "Sold" for an in-person sale at an event. Stock decrements immediately -- this is not a
        customer order, no shipping or payment proof.
      </p>

      {session.role === "admin" && stallList.length > 1 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {stallList.map((s) => (
            <a
              key={s.id}
              href={`/vendor/mode?artist=${s.slug}`}
              style={{
                padding: "4px 10px",
                fontSize: 13,
                border: "1px solid #ccc",
                borderRadius: 4,
                textDecoration: "none",
                color: s.id === selectedArtistId ? "#fff" : "#333",
                background: s.id === selectedArtistId ? "#333" : "transparent",
              }}
            >
              {s.name}
            </a>
          ))}
        </div>
      )}

      <VendorModeCatalogue artistId={artist.id} sections={sections} soldToday={soldToday} />

      <EndOfDayPanel sales={todaySales} total={todayTotal} />
      </div>
    </>
  );
}
