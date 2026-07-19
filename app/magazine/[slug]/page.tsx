import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ExpandableImage from "@/components/ExpandableImage";
import { createClient } from "@/lib/supabase-server";

export const revalidate = 0;

type PostRow = {
  title: string;
  excerpt: string | null;
  body: string | null;
  category: string | null;
  hero_image_url: string | null;
  published_at: string | null;
};

export default async function MagazinePostPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("magazine_posts")
    .select("title, excerpt, body, category, hero_image_url, published_at")
    .eq("slug", params.slug)
    .eq("published", true)
    .maybeSingle<PostRow>();

  if (!post) return notFound();

  // No markdown renderer in this app -- rendered as plain paragraphs
  // (split on blank lines), not real markdown syntax.
  const paragraphs = (post.body ?? "").split(/\n\s*\n/).filter((p) => p.trim());

  return (
    <>
      <Header />
      <article className="mx-auto max-w-3xl px-6 py-16">
        <p className="mb-6">
          <Link href="/magazine" className="text-sm text-warm-grey hover:text-accent">
            &larr; Back to the magazine
          </Link>
        </p>

        {post.category && (
          <p className="font-mono text-xs uppercase text-accent mb-2">{post.category}</p>
        )}
        <h1 className="font-display text-4xl mb-4">{post.title}</h1>
        {post.published_at && (
          <p className="text-xs text-warm-grey mb-8">
            {new Date(post.published_at).toLocaleDateString()}
          </p>
        )}

        {post.hero_image_url && (
          <div className="bg-white border border-line p-3 mb-10">
            <ExpandableImage
              images={[{ src: post.hero_image_url, alt: post.title }]}
              frameClassName="bg-paper flex items-center justify-center overflow-hidden"
              sizes="(min-width: 768px) 720px, 100vw"
            />
          </div>
        )}

        <div className="space-y-5 text-warm-grey">
          {paragraphs.length === 0 && post.excerpt && <p>{post.excerpt}</p>}
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </article>
      <Footer />
    </>
  );
}
