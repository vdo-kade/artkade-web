import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FreebieCard from "@/components/FreebieCard";
import { createClient } from "@/lib/supabase-server";
import { FREEBIE_SELECT, mapFreebie, type FreebieRow } from "@/lib/freebies";

export const revalidate = 0;

type ArtistWithFreebiesRow = {
  slug: string;
  name: string;
  tagline: string | null;
  accent_color: string;
  freebies: FreebieRow[];
};

export default async function FreebiesPage() {
  const supabase = await createClient();

  // freebies has no is_active column of its own (every row is public by
  // design, see supabase/schema.sql) -- filtering to active stalls here is
  // what keeps an archived/expired pop-up's freebies from still showing,
  // same as the landing page's product feed does for products.
  const { data: artistRows } = await supabase
    .from("artists")
    .select(`slug, name, tagline, accent_color, freebies(${FREEBIE_SELECT})`)
    .eq("is_active", true)
    .order("sort_order")
    .returns<ArtistWithFreebiesRow[]>();

  const stallsWithFreebies = (artistRows ?? [])
    .map((a) => ({
      slug: a.slug,
      name: a.name,
      tagline: a.tagline,
      accentColor: a.accent_color,
      freebies: [...a.freebies].sort((x, y) => (x.created_at < y.created_at ? 1 : -1)).map(mapFreebie),
    }))
    // A stall with zero freebies gets no row at all -- an empty section
    // heading with nothing under it isn't useful to anyone.
    .filter((s) => s.freebies.length > 0);

  return (
    <>
      <Header />
      <div className="mx-auto max-w-6xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2">On the house</p>
        <h1 className="font-display text-3xl md:text-4xl mb-4">Freebies</h1>
        <p className="max-w-xl text-warm-grey mb-14">
          Wallpapers, ringtones, tracks and more, free to download straight from each stall. No bag,
          no checkout, just grab it.
        </p>

        {stallsWithFreebies.length === 0 && (
          <p className="text-warm-grey">Nothing here yet. Check back soon.</p>
        )}

        {stallsWithFreebies.map((stall) => (
          <div key={stall.slug} className="mb-16">
            <div className="h-2 w-10 mb-4" style={{ backgroundColor: stall.accentColor }} aria-hidden />
            <h2 className="font-display text-2xl mb-1">{stall.name}</h2>
            {stall.tagline && <p className="text-sm text-warm-grey mb-6">{stall.tagline}</p>}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 items-start">
              {stall.freebies.map((f) => (
                <FreebieCard key={f.id} freebie={f} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <Footer />
    </>
  );
}
