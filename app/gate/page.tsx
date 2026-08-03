import Image from "next/image";
import { createClient } from "@/lib/supabase-server";
import { LOGO_URL, LOGO_SHADOW_FILTER } from "@/lib/brand";
import { ActionForm } from "@/components/ActionForm";
import PolaroidBackground, { type PolaroidImage } from "@/components/PolaroidBackground";
import { firstBySortOrder, mediaPath } from "@/lib/catalogue";
import { enterGate, submitBetaSignup } from "./actions";

export const revalidate = 0;

// Same proxy every other public product photo goes through (see
// lib/catalogue.ts's mediaPath and app/api/media/image/[id]/route.ts) --
// this page used to select image_url directly, which put the raw Storage
// URL of up to 40 products' art in the DOM of the very first page an
// anonymous, not-yet-gated visitor sees.
type ProductImageRow = { name: string; product_images: { id: string; sort_order: number }[] };

export default async function GatePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("name, product_images(id, sort_order)")
    .eq("is_active", true)
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(40)
    .returns<ProductImageRow[]>();

  const images: PolaroidImage[] = (data ?? [])
    .map((p) => {
      const first = firstBySortOrder(p.product_images);
      return first ? { src: mediaPath(first.id), alt: p.name } : null;
    })
    .filter((img): img is PolaroidImage => img !== null);

  return (
    <main className="relative min-h-screen overflow-hidden bg-cream flex items-center justify-center px-6 py-16">
      <PolaroidBackground images={images} />
      {/* Scrim between the polaroid scatter and the form -- keeps the
          background decorative/subtle regardless of which images happen
          to be showing, per the "not distracting from the form" brief. */}
      <div aria-hidden className="absolute inset-0 bg-cream/75" />

      <div className="relative z-10 w-full max-w-md text-center">
        <Image
          src={LOGO_URL}
          alt="Art Kade"
          width={1522}
          height={478}
          sizes="(min-width: 640px) 350px, 250px"
          priority
          className="mx-auto h-20 sm:h-28 w-auto mb-8"
          style={{ filter: LOGO_SHADOW_FILTER }}
        />

        <h1 className="font-display text-3xl sm:text-4xl mb-3">Only the chosen may enter.</h1>
        <p className="text-warm-grey mb-10">
          Art Kade is still being built behind closed doors. If you already have the password, come on in.
        </p>

        <div className="light-surface">
          <ActionForm action={enterGate}>
            <label
              htmlFor="gate-password"
              className="block text-left font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2"
            >
              Enter the password
            </label>
            <input
              id="gate-password"
              type="password"
              name="password"
              required
              autoComplete="off"
              className="w-full border border-line bg-white px-4 py-3 mb-4 text-base"
            />
            <button
              type="submit"
              className="light-surface w-full bg-ink text-white px-7 py-3 text-sm font-medium tracking-wide hover:bg-accent transition-colors"
            >
              Enter the Kade
            </button>
          </ActionForm>
        </div>

        <div className="my-10 border-t border-line" />

        <p className="text-sm text-warm-grey mb-4">
          No password? Leave your email below, and you might get let in early — before anyone else finds the door.
        </p>
        <div>
          {/* Unlike the password form above, this one isn't wrapped in
              .light-surface as a whole -- its button is an outline (no
              fill), and pinning the wrapper would cascade the pinned
              (fixed-dark) --color-ink into it too, leaving dark text on a
              dark canvas with nothing to give it contrast (a solid
              bg-ink button has its own fill to read against; an outline
              button has only the page behind it, so it needs to flip
              with the page instead of staying fixed). Only the input
              itself is pinned directly. */}
          <ActionForm action={submitBetaSignup} successMessage="You're on the list." resetOnSuccess>
            {/* Honeypot -- invisible to real visitors (off-screen, unreachable
                by tab, hidden from screen readers), but a scripted bot filling
                every field it finds will fill this one too. See the "company"
                check in submitBetaSignup. */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
            />
            <label
              htmlFor="gate-email"
              className="block text-left font-mono text-xs uppercase tracking-eyebrow text-warm-grey mb-2"
            >
              Your email
            </label>
            <input
              id="gate-email"
              type="email"
              name="email"
              required
              className="light-surface w-full border border-line bg-white px-4 py-3 mb-4 text-base"
            />
            <button
              type="submit"
              className="w-full border border-ink px-7 py-3 text-sm font-medium tracking-wide hover:border-accent hover:text-accent"
            >
              Ask to Enter
            </button>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}
