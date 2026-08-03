import Image from "next/image";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard, { Product, PRIORITY_CARD_COUNT } from "@/components/ProductCard";
import Countdown from "@/components/Countdown";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  ArtistWithProducts,
  CATEGORY_LABELS,
  PRODUCT_SELECT,
  mapProduct,
  resolveCategoryOrder,
} from "@/lib/catalogue";

export const revalidate = 0;

export default async function StallPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient();

  const { data: artist } = await supabase
    .from("artists")
    .select(
      `slug, name, tagline, bio, logo_url, hero_image_url, accent_color, is_popup, popup_ends_at, category_order, products(${PRODUCT_SELECT})`
    )
    .eq("slug", params.slug)
    .eq("is_active", true)
    .order("sort_order", { foreignTable: "products" })
    .single<ArtistWithProducts & { category_order: string[] | null }>();

  if (!artist) return notFound();

  const presentCategories = Array.from(new Set(artist.products.map((p) => p.category)));
  const sections = resolveCategoryOrder(artist.category_order, presentCategories).map((category) => ({
    title: CATEGORY_LABELS[category],
    products: artist.products
      .filter((p) => p.category === category)
      .map((p) => mapProduct(p, artist.slug, artist.name)) as Product[],
  })).filter((section) => section.products.length > 0);

  return (
    <>
      <Header />
      <section
        className="relative overflow-hidden border-b border-line py-16 px-6 text-center"
        style={{ backgroundColor: `${artist.accent_color}12` }}
      >
        {/* A CSS background-image here previously bypassed next/image
            entirely -- no WebP/AVIF conversion, no responsive srcset, no
            Vercel edge caching, so every stall page view re-fetched the
            full raw file straight from Supabase Storage. It's also the
            page's LCP element, so priority matters as much as the format
            savings do. */}
        {artist.hero_image_url && (
          <>
            <Image
              src={artist.hero_image_url}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/40" />
          </>
        )}
        <div className="relative mx-auto max-w-3xl">
          {artist.logo_url && (
            <Image
              src={artist.logo_url}
              alt={`${artist.name} logo`}
              width={128}
              height={128}
              sizes="64px"
              className="mx-auto mb-4 h-16 w-16 rounded-full border border-line bg-white object-cover"
            />
          )}
          <h1 className={`font-display text-5xl mb-3 ${artist.hero_image_url ? "text-white" : ""}`}>
            {artist.name}
          </h1>
          <p className={artist.hero_image_url ? "text-white/80" : "text-warm-grey"}>{artist.tagline}</p>
          {artist.bio && (
            <p className={`mt-3 ${artist.hero_image_url ? "text-white/80" : "text-warm-grey"}`}>{artist.bio}</p>
          )}
          {artist.is_popup && artist.popup_ends_at && (
            <p className="mt-4 inline-block bg-ink text-white text-xs font-mono uppercase px-3 py-2">
              Pop-up drop · <Countdown endsAt={artist.popup_ends_at} />
            </p>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 py-14">
        {(() => {
          // Priority images are budgeted across the whole page, not
          // per-section -- a stall whose first category only has one or
          // two products would otherwise leave the second section's
          // opening cards (still right under the fold) lazy-loaded.
          let priorityRemaining = PRIORITY_CARD_COUNT;
          return sections.map((section) => (
            <div key={section.title} className="mb-14">
              <h2 className="font-display text-2xl mb-6">{section.title}</h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 items-start overflow-x-hidden">
                {section.products.map((p) => {
                  const priority = priorityRemaining > 0;
                  if (priority) priorityRemaining--;
                  return <ProductCard key={p.id} product={p} priority={priority} showStall={false} />;
                })}
              </div>
            </div>
          ));
        })()}
      </div>

      <Footer />
    </>
  );
}
