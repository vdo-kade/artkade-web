import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MagazineCard, { MagazinePost } from "@/components/MagazineCard";
import { createClient } from "@/lib/supabase-server";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Magazine — Art Kade",
  alternates: { canonical: "/magazine" },
};

type PostRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  hero_image_url: string | null;
  is_featured: boolean;
};

function toMagazinePost(row: PostRow): MagazinePost {
  return {
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    category: row.category,
    heroImageUrl: row.hero_image_url,
  };
}

export default async function MagazinePage() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("magazine_posts")
    .select("slug, title, excerpt, category, hero_image_url, is_featured")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .returns<PostRow[]>();

  const allPosts = posts ?? [];
  // A manually featured post always wins the hero slot. If none is marked
  // -- nothing's ever been set, or the featured one got deleted or
  // unpublished (is_featured only ever lives on a published row, see
  // app/admin/magazine/actions.ts's updatePost) -- this falls back to the
  // newest post, exactly the behavior this feature replaced.
  const featuredIndex = allPosts.findIndex((p) => p.is_featured);
  const latestIndex = featuredIndex >= 0 ? featuredIndex : 0;
  const latest = allPosts[latestIndex];
  const rest = allPosts.filter((_, i) => i !== latestIndex);

  return (
    <>
      <Header />
      <section className="mx-auto max-w-5xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2">
          The Art Kade magazine
        </p>
        <h1 className="font-display text-4xl mb-10">Stories from the kade</h1>

        {!latest && <p className="text-warm-grey">Nothing published yet -- check back soon.</p>}

        {latest && (
          <div className="mb-16">
            <p className="font-mono text-xs uppercase tracking-eyebrow text-accent mb-4">
              Latest release
            </p>
            <MagazineCard post={toMagazinePost(latest)} featured />
          </div>
        )}

        {rest.length > 0 && (
          <>
            <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-6 pt-8 border-t border-line">
              More stories
            </p>
            <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3 items-start">
              {rest.map((post) => (
                <MagazineCard key={post.slug} post={toMagazinePost(post)} />
              ))}
            </div>
          </>
        )}
      </section>
      <Footer />
    </>
  );
}
