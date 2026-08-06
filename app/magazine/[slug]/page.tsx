import type { Metadata } from "next";
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

async function getPost(slug: string): Promise<PostRow | null> {
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("magazine_posts")
    .select("title, excerpt, body, category, hero_image_url, published_at")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle<PostRow>();
  return post;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) return {};
  return {
    title: `${post.title} — Art Kade Magazine`,
    description: post.excerpt ?? undefined,
    alternates: { canonical: `/magazine/${params.slug}` },
  };
}

// A very small markdown subset -- just enough for what magazine posts
// actually use (see supabase/schema.sql's `body text, -- markdown`
// comment, which this used to not honor at all): "## " headings and
// [text](url) links. Deliberately not a full markdown library -- the only
// two block/inline forms editorial copy here has ever needed are these,
// and every link a post carries is a real outbound backlink (press
// coverage, an artist's own site/socials), so rendering [text](url) as an
// actual <a> rather than literal bracket text is the whole point of this
// function, not a nice-to-have.
function renderInline(text: string, keyPrefix: string) {
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const nodes: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = linkPattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(
      <a
        key={`${keyPrefix}-link-${i++}`}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline"
      >
        {match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderBody(body: string) {
  const blocks = body.split(/\n\s*\n/).filter((b) => b.trim());
  return blocks.map((block, i) => {
    const trimmed = block.trim();
    if (trimmed.startsWith("## ")) {
      return (
        <h2 key={i} className="font-display text-2xl mt-10 mb-3 text-ink">
          {renderInline(trimmed.slice(3).trim(), `h2-${i}`)}
        </h2>
      );
    }
    return <p key={i}>{renderInline(trimmed, `p-${i}`)}</p>;
  });
}

export default async function MagazinePostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) return notFound();

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
          <div className="light-surface bg-white border border-line p-3 mb-10">
            <ExpandableImage
              images={[{ src: post.hero_image_url, alt: post.title }]}
              frameClassName="bg-paper flex items-center justify-center overflow-hidden"
              sizes="(min-width: 768px) 720px, 100vw"
            />
          </div>
        )}

        <div className="space-y-5 text-warm-grey">
          {!post.body && post.excerpt && <p>{post.excerpt}</p>}
          {post.body && renderBody(post.body)}
        </div>
      </article>
      <Footer />
    </>
  );
}
