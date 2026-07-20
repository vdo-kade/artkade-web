import Image from "next/image";
import { createClient } from "@/lib/supabase-server";
import { LOGO_URL, LOGO_OUTLINE_FILTER_LARGE } from "@/lib/brand";
import { ActionForm } from "@/components/ActionForm";
import PolaroidBackground, { type PolaroidImage } from "@/components/PolaroidBackground";
import { enterGate, submitBetaSignup } from "./actions";

export const revalidate = 0;

type ProductImageRow = { name: string; image_url: string | null };

export default async function GatePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("name, image_url")
    .eq("is_active", true)
    .not("image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(40)
    .returns<ProductImageRow[]>();

  const images: PolaroidImage[] = (data ?? [])
    .filter((p): p is ProductImageRow & { image_url: string } => !!p.image_url)
    .map((p) => ({ src: p.image_url, alt: p.name }));

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
          width={1555}
          height={497}
          sizes="(min-width: 640px) 350px, 250px"
          priority
          className="mx-auto h-20 sm:h-28 w-auto mb-8"
          style={{ filter: LOGO_OUTLINE_FILTER_LARGE }}
        />

        <h1 className="font-display text-3xl sm:text-4xl mb-3">Only the chosen may enter.</h1>
        <p className="text-warm-grey mb-10">
          Art Kade is still being built behind closed doors. If you already have the password, come on in.
        </p>

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
            className="w-full bg-ink text-white px-7 py-3 text-sm font-medium tracking-wide hover:bg-accent transition-colors"
          >
            Enter the Kade
          </button>
        </ActionForm>

        <div className="my-10 border-t border-line" />

        <p className="text-sm text-warm-grey mb-4">
          No password? Leave your email below, and you might get let in early — before anyone else finds the door.
        </p>
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
            className="w-full border border-line bg-white px-4 py-3 mb-4 text-base"
          />
          <button
            type="submit"
            className="w-full border border-ink px-7 py-3 text-sm font-medium tracking-wide hover:border-accent hover:text-accent transition-colors"
          >
            Ask to Enter
          </button>
        </ActionForm>
      </div>
    </main>
  );
}
