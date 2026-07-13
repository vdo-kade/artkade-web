import Header from "@/components/Header";
import Footer from "@/components/Footer";

// EDIT: replace with supabase.from('magazine_posts').select('*').eq('published', true).order('published_at', {ascending:false})
const POSTS = [
  {
    slug: "interview-nuwan-shilpa",
    title: "Interview: Nuwan Shilpa",
    excerpt: "The guest artist behind Art Kade's second stall, on his one-off colourways and process.",
    category: "Interview",
  },
  {
    slug: "interview-varsha-vdokade",
    title: "Interview: Varsha, the artist behind Vdokade",
    excerpt: "From short-form comedy to the first Art Kade drop — how Vdokade started.",
    category: "Interview",
  },
];

export default function MagazinePage() {
  return (
    <>
      <Header />
      <section className="mx-auto max-w-4xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2">
          The Art Kade magazine
        </p>
        <h1 className="font-display text-4xl mb-10">Stories from the kade</h1>
        <div className="space-y-10">
          {POSTS.map((post) => (
            <article key={post.slug} className="border-b border-line pb-8">
              <p className="font-mono text-xs uppercase text-accent mb-2">{post.category}</p>
              <h2 className="font-display text-2xl mb-2">{post.title}</h2>
              <p className="text-warm-grey">{post.excerpt}</p>
            </article>
          ))}
        </div>
      </section>
      <Footer />
    </>
  );
}
