import Link from "next/link";
import ExpandableImage from "./ExpandableImage";

export type MagazinePost = {
  slug: string;
  title: string;
  excerpt: string | null;
  category: string | null;
  heroImageUrl: string | null;
};

// The image and the title/text are deliberately separate click targets --
// clicking the picture opens it full-size (see ExpandableImage), clicking
// the title/"Read the story" navigates to the post. A <button> nested
// inside an <a> is both invalid HTML and ambiguous to click, so the image
// is never wrapped in the post Link.
export default function MagazineCard({ post, featured = false }: { post: MagazinePost; featured?: boolean }) {
  return (
    <article>
      <div className="bg-white border border-line p-3 pb-4">
        <ExpandableImage
          images={post.heroImageUrl ? [{ src: post.heroImageUrl, alt: post.title }] : []}
          frameClassName="bg-paper min-h-[10rem] flex items-center justify-center overflow-hidden"
          placeholder={<span className="text-warm-grey text-xs font-mono">photo coming soon</span>}
          sizes={
            featured
              ? "(min-width: 1200px) 1152px, 100vw"
              : "(min-width: 1024px) 360px, (min-width: 640px) 48vw, 90vw"
          }
        />
      </div>

      <div className="pt-4 px-1">
        {post.category && (
          <p className="font-mono text-xs uppercase text-accent mb-2">{post.category}</p>
        )}
        <Link href={`/magazine/${post.slug}`} className="group">
          <h2
            className={`font-display leading-tight group-hover:text-accent transition-colors ${
              featured ? "text-3xl md:text-4xl mb-3" : "text-xl mb-2"
            }`}
          >
            {post.title}
          </h2>
        </Link>
        {post.excerpt && (
          <p className={`text-warm-grey ${featured ? "text-base max-w-2xl mb-4" : "text-sm mb-3"}`}>
            {post.excerpt}
          </p>
        )}
        <Link
          href={`/magazine/${post.slug}`}
          className="text-sm font-medium hover:text-accent transition-colors"
        >
          Read the story &rarr;
        </Link>
      </div>
    </article>
  );
}
