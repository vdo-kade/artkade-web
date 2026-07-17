import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StallCard, { Stall } from "@/components/StallCard";
import ProductCard, { Product } from "@/components/ProductCard";
import StickerWheel, { WheelImage } from "@/components/StickerWheel";
import { createClient } from "@/lib/supabase-server";
import { PRODUCT_SELECT, mapProduct, mapStall } from "@/lib/catalogue";
import { LOGO_URL } from "@/lib/brand";

export const revalidate = 0;

const STEPS = [
  { n: 1, title: "Fill your bag", body: "Pick prints, stickers and merch from any stall." },
  { n: 2, title: "Choose payment", body: "Bank transfer for now. More methods soon." },
  { n: 3, title: "Upload confirmation", body: "Attach your transfer screenshot at checkout." },
  { n: 4, title: "We review it", body: "A human checks your payment, usually same day." },
  { n: 5, title: "Confirmation email", body: "You'll get an email once it's approved." },
  { n: 6, title: "Shipping", body: "Packed and sent within the week." },
];

export default async function LandingPage() {
  const supabase = await createClient();

  const [{ data: artistRows }, { data: productRows }] = await Promise.all([
    supabase
      .from("artists")
      .select("slug, name, tagline, accent_color, is_popup, popup_ends_at")
      .eq("is_active", true)
      .order("sort_order"),
    // Inner-joined against artists.is_active so a product doesn't leak here
    // just because its own is_active is still true -- an archived (e.g.
    // expired pop-up) stall's products must vanish from this feed even if
    // no one has touched the individual product rows. /stalls/[slug] is
    // already safe on its own: it 404s straight off artists.is_active.
    supabase
      .from("products")
      .select(`${PRODUCT_SELECT}, artists!inner(is_active)`)
      .eq("is_active", true)
      .eq("artists.is_active", true)
      .order("sort_order")
      .limit(4),
  ]);

  const STALLS: Stall[] = (artistRows ?? []).map(mapStall);
  const FEATURED_PRODUCTS: Product[] = (productRows ?? []).map(mapProduct);

  const WHEEL_IMAGES: WheelImage[] = FEATURED_PRODUCTS.map((p) => ({
    id: p.id,
    imageUrl: p.imageUrl ?? "",
    label: p.name,
  }));

  return (
    <>
      <Header />
      <StickerWheel images={WHEEL_IMAGES} />

      {/* HERO -- the site's real brand moment: full-bleed matte black (the
          same "ink" token used everywhere else on the site, not a one-off
          black) with the logo large and centered, so it reads as a
          deliberate statement rather than a bigger version of the header's
          small elevated mark. */}
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-6xl px-6 pt-16 pb-20 md:pt-20 md:pb-24 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_URL}
            alt="Art Kade"
            className="mx-auto h-24 sm:h-32 md:h-40 w-auto mb-8 drop-shadow-[0_16px_32px_rgba(0,0,0,0.5)]"
          />
          <p className="font-mono text-xs uppercase tracking-eyebrow text-white/50 mb-6">
            Kade means shop
          </p>
          <h1 className="font-display text-5xl md:text-7xl leading-[0.95] mb-6">
            A curated Sri Lankan
            <br />
            creative marketplace
          </h1>
          <p className="max-w-xl mx-auto text-white/70 mb-10">
            Art Kade is where Vdokade, Nuwan Shilpa and future artists release
            limited prints, stickers and merch. Every stall is its own little
            world. Come wander through.
          </p>
          <a
            href="#stalls"
            className="inline-block bg-accent text-ink px-7 py-3 text-sm font-medium tracking-wide hover:bg-white transition-colors"
          >
            Browse the Stalls
          </a>
        </div>
      </section>

      {/* FEATURED STALLS */}
      <section id="stalls" className="mx-auto max-w-6xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2">
          Three stalls, one kade
        </p>
        <h2 className="font-display text-3xl md:text-4xl mb-10">Pick a stall</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {STALLS.map((s) => (
            <StallCard key={s.slug} stall={s} />
          ))}
        </div>
      </section>

      {/* FEATURED DROP */}
      <section id="drop" className="mx-auto max-w-6xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2">
          Fresh off the press
        </p>
        <h2 className="font-display text-3xl md:text-4xl mb-10">From the current drop</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 items-start">
          {FEATURED_PRODUCTS.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* SHOPPING PROCESS */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2">
          No card machines
        </p>
        <h2 className="font-display text-3xl md:text-4xl mb-10">Just us.</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="border border-dashed border-line p-5">
              <span className="font-display text-3xl text-paper" style={{ WebkitTextStroke: "1.5px #1C1712" }}>
                {s.n}
              </span>
              <h3 className="font-medium mt-2 mb-1">{s.title}</h3>
              <p className="text-sm text-warm-grey">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </>
  );
}
