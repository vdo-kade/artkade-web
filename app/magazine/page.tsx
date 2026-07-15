import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { createClient } from "@/lib/supabase-server";

export const revalidate = 0;

type PostRow = {
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  hero_image_url: string | null;
};

export default async function MagazinePage() {
  const supabase = await createClient();
  const { data: posts } = await supabase
    .from("magazine_posts")
    .select("slug, title, excerpt, category, hero_image_url")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .returns<PostRow[]>();

  return (
    <>
      <Header />
      <section className="mx-auto max-w-4xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2">
          The Art Kade magazine
        </p>
        <h1 className="font-display text-4xl mb-10">Stories from the kade</h1>

        {(!posts || posts.length === 0) && (
          <p className="text-warm-grey">Nothing published yet -- check back soon.</p>
        )}

        <div className="space-y-10">
          {(posts ?? []).map((post) => (
            <Link key={post.slug} href={`/magazine/${post.slug}`} className="block group">
              <article className="border-b border-line pb-8">
                {post.category && (
                  <p className="font-mono text-xs uppercase text-accent mb-2">{post.category}</p>
                )}
                <h2 className="font-display text-2xl mb-2 group-hover:text-accent transition-colors">
                  {post.title}
                </h2>
                {post.excerpt && <p className="text-warm-grey">{post.excerpt}</p>}
              </article>
            </Link>
          ))}
        </div>
      </section>
      <Footer />
    </>
  );
}
