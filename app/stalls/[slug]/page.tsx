import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard, { Product } from "@/components/ProductCard";
import Countdown from "@/components/Countdown";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  ArtistWithProducts,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  PRODUCT_SELECT,
  mapProduct,
} from "@/lib/catalogue";

export const revalidate = 0;

export default async function StallPage({ params }: { params: { slug: string } }) {
  const supabase = await createClient();

  const { data: artist } = await supabase
    .from("artists")
    .select(
      `slug, name, tagline, bio, logo_url, hero_image_url, accent_color, is_popup, popup_ends_at, products(${PRODUCT_SELECT})`
    )
    .eq("slug", params.slug)
    .eq("is_active", true)
    .order("sort_order", { foreignTable: "products" })
    .single<ArtistWithProducts>();

  if (!artist) return notFound();

  const sections = CATEGORY_ORDER.map((category) => ({
    title: CATEGORY_LABELS[category],
    products: artist.products
      .filter((p) => p.category === category)
      .map(mapProduct) as Product[],
  })).filter((section) => section.products.length > 0);

  return (
    <>
      <Header />
      <section
        className="relative overflow-hidden border-b border-line py-16 px-6 text-center"
        style={{ backgroundColor: `${artist.accent_color}12` }}
      >
        {artist.hero_image_url && (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${artist.hero_image_url})` }}
            />
            <div className="absolute inset-0 bg-black/40" />
          </>
        )}
        <div className="relative mx-auto max-w-3xl">
          {artist.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artist.logo_url}
              alt={`${artist.name} logo`}
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
        {sections.map((section) => (
          <div key={section.title} className="mb-14">
            <h2 className="font-display text-2xl mb-6">{section.title}</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {section.products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <Footer />
    </>
  );
}
