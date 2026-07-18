import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchForm from "@/components/SearchForm";
import StallCard, { Stall } from "@/components/StallCard";
import ProductCard, { Product } from "@/components/ProductCard";
import { createClient } from "@/lib/supabase-server";
import { PRODUCT_SELECT, mapProduct, mapStall } from "@/lib/catalogue";

export const revalidate = 0;

// Simple substring match (ilike), not fuzzy -- same RLS-backed anon client
// and active/published filtering every other public page uses (see
// lib/catalogue.ts), just with a name filter added on top.
export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? "").trim().slice(0, 100);
  const supabase = await createClient();

  let stalls: Stall[] = [];
  let products: Product[] = [];

  if (q) {
    const [{ data: artistRows }, { data: productRows }] = await Promise.all([
      supabase
        .from("artists")
        .select("slug, name, tagline, accent_color, is_popup, popup_ends_at")
        .eq("is_active", true)
        .ilike("name", `%${q}%`)
        .order("sort_order"),
      // Inner-joined against artists.is_active for the same reason as the
      // landing page's featured feed: a product shouldn't surface here just
      // because its own is_active is still true if its stall is archived.
      supabase
        .from("products")
        .select(`${PRODUCT_SELECT}, artists!inner(is_active)`)
        .eq("is_active", true)
        .eq("artists.is_active", true)
        .ilike("name", `%${q}%`)
        .order("sort_order")
        .limit(24),
    ]);
    stalls = (artistRows ?? []).map(mapStall);
    products = (productRows ?? []).map(mapProduct);
  }

  const hasResults = stalls.length > 0 || products.length > 0;

  return (
    <>
      <Header />
      <section className="mx-auto max-w-6xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2">Search</p>
        <h1 className="font-display text-3xl md:text-4xl mb-8">
          {q ? `Results for "${q}"` : "Search Art Kade"}
        </h1>
        <SearchForm id="site-search-page" defaultValue={q} className="max-w-md mb-14" />

        {!q && <p className="text-warm-grey">Search for a product or a stall by name.</p>}
        {q && !hasResults && (
          <p className="text-warm-grey">No matches for &quot;{q}&quot;. Try a different search.</p>
        )}

        {stalls.length > 0 && (
          <div className="mb-14">
            <h2 className="font-display text-2xl mb-6">Stalls</h2>
            <div className="grid gap-6 md:grid-cols-3">
              {stalls.map((s) => (
                <StallCard key={s.slug} stall={s} />
              ))}
            </div>
          </div>
        )}

        {products.length > 0 && (
          <div>
            <h2 className="font-display text-2xl mb-6">Products</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 items-start">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </section>
      <Footer />
    </>
  );
}
