import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

// Root-level not-found -- Next.js renders this both for a URL that matches
// no route at all, and for every notFound() call anywhere in the tree
// (bad stall slug in app/stalls/[slug]/page.tsx, bad product slug in
// app/stalls/[slug]/products/[productSlug]/page.tsx, bad magazine slug)
// since none of those routes define a closer not-found.tsx of their own.
// One branded page for all three instead of the framework's bare default,
// which matters here specifically because links get shared over WhatsApp,
// where URLs are routinely truncated or mangled in transit.
export default function NotFound() {
  return (
    <>
      <Header />
      <section className="mx-auto max-w-xl px-6 py-24 text-center">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-accent mb-4">404</p>
        <h1 className="font-display text-4xl mb-4">This one&apos;s empty.</h1>
        <p className="text-warm-grey mb-10">
          Whatever you were looking for isn&apos;t here — sold out, moved, or the link lost
          something on the way over. Happens a lot with WhatsApp.
        </p>
        {/* Only the solid button is pinned -- an outline button has no
            fill of its own to read against, so it needs to flip with the
            page rather than stay fixed-dark (see app/gate/page.tsx's
            "Ask to Enter" for the same reasoning). Pinning the whole
            wrapper here would cascade into the outline button too and
            leave it dark-on-dark. The outline button also drops
            transition-colors (confirmed live): an element whose resting
            colour is var()-based and changes with the theme toggle gets
            stuck showing the pre-toggle colour indefinitely when
            transition-colors is present -- not just a first-paint flash,
            reproduced well after the toggle settled. Root cause not fully
            isolated; dropping the transition is the confirmed fix. Hover
            colour changes are still instant, just not animated. */}
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/#stalls"
            className="light-surface inline-block bg-ink text-white px-7 py-3 text-sm font-medium hover:bg-accent transition-colors"
          >
            Browse the stalls
          </Link>
          <Link
            href="/"
            className="inline-block border border-ink px-7 py-3 text-sm font-medium hover:border-accent hover:text-accent"
          >
            Back to the homepage
          </Link>
        </div>
      </section>
      <Footer />
    </>
  );
}
