import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase-server";
import { SITE_URL } from "@/lib/brand";

// Same anon/RLS-scoped client every other public page uses (search,
// magazine, stalls) -- sitemap generation only ever needs to see what an
// anonymous visitor could already see, so there's no reason to reach for
// the service-role client here.

export const revalidate = 0;

type StallRow = { slug: string; created_at: string };
type MagazinePostRow = { slug: string; published_at: string | null; created_at: string };
type ProductRow = { slug: string; created_at: string; artists: { slug: string } };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  const [
    { data: stalls, error: stallsError },
    { data: posts, error: postsError },
    { data: products, error: productsError },
  ] = await Promise.all([
    supabase.from("artists").select("slug, created_at").eq("is_active", true).returns<StallRow[]>(),
    supabase
      .from("magazine_posts")
      .select("slug, published_at, created_at")
      .eq("published", true)
      .returns<MagazinePostRow[]>(),
    // Products now have a real dedicated URL (app/stalls/[slug]/products/
    // [productSlug]/page.tsx) -- artists!inner both scopes to an active
    // stall and carries its slug for the URL, same pattern as the search
    // page's product query.
    supabase
      .from("products")
      .select("slug, created_at, artists!inner(slug, is_active)")
      .eq("is_active", true)
      .eq("artists.is_active", true)
      .returns<ProductRow[]>(),
  ]);
  if (stallsError) console.error("Failed to load stalls for sitemap:", stallsError);
  if (postsError) console.error("Failed to load magazine posts for sitemap:", postsError);
  if (productsError) console.error("Failed to load products for sitemap:", productsError);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/magazine`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/freebies`, changeFrequency: "weekly", priority: 0.5 },
  ];

  const stallEntries: MetadataRoute.Sitemap = (stalls ?? []).map((stall) => ({
    url: `${SITE_URL}/stalls/${stall.slug}`,
    lastModified: new Date(stall.created_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const productEntries: MetadataRoute.Sitemap = (products ?? []).map((product) => ({
    url: `${SITE_URL}/stalls/${product.artists.slug}/products/${product.slug}`,
    lastModified: new Date(product.created_at),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const magazineEntries: MetadataRoute.Sitemap = (posts ?? []).map((post) => ({
    url: `${SITE_URL}/magazine/${post.slug}`,
    lastModified: new Date(post.published_at ?? post.created_at),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticEntries, ...stallEntries, ...productEntries, ...magazineEntries];
}
