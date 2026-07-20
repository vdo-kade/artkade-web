"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase";
import { LOGO_URL, LOGO_OUTLINE_FILTER_SMALL } from "@/lib/brand";
import SocialIcon from "./SocialIcon";

type SocialLink = { label: string; url: string };
type SocialArtist = { id: string; name: string; socials: SocialLink[] };

// Fetches client-side via the browser anon client rather than as an async
// Server Component -- Footer is rendered from both Server Component pages
// (app/page.tsx, etc.) and Client Component pages (app/checkout/page.tsx is
// "use client"), and a Client Component can't directly import a Server
// Component that touches next/headers. Same pattern as this page's own
// BankTransferDetails: useEffect + useState, RLS already scopes what an
// anon read can see (see supabase/schema.sql's "public can read active
// artists" policy), so no admin client is needed here.
function useFooterSocialArtists(): SocialArtist[] {
  const [artists, setArtists] = useState<SocialArtist[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("artists")
      .select("id, name, socials")
      .eq("is_active", true)
      .eq("show_socials_in_footer", true)
      .order("sort_order")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load footer social links:", error);
          return;
        }
        setArtists(
          ((data ?? []) as { id: string; name: string; socials: SocialLink[] | null }[])
            .filter((a) => Array.isArray(a.socials) && a.socials.length > 0)
            .map((a) => ({ id: a.id, name: a.name, socials: a.socials! }))
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return artists;
}

export default function Footer() {
  const socialArtists = useFooterSocialArtists();

  return (
    <footer className="border-t border-line mt-24">
      <div className="mx-auto max-w-6xl px-6 py-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4 text-sm">
        <div>
          {/* Full logo (not the header/gate's short "AX" mark) -- the
              footer is its own brand moment, not a compact nav bar, so it
              gets the full wordmark+mark lockup. Same transparent-on-cream
              + hard-edged-outline treatment as everywhere else the logo
              sits directly on cream (see lib/brand.ts): the "small" filter
              matches this rendered scale, not the homepage hero's heavier
              one. */}
          <Image
            src={LOGO_URL}
            alt="Art Kade"
            width={1555}
            height={497}
            sizes="160px"
            className="h-9 w-auto"
            style={{ filter: LOGO_OUTLINE_FILTER_SMALL }}
          />
          <p className="mt-3 text-warm-grey max-w-xs">
            A curated Sri Lankan creative marketplace. Kade means shop.
          </p>
        </div>

        <div>
          <p className="font-medium mb-3 tracking-eyebrow uppercase text-xs text-warm-grey">
            The stalls
          </p>
          <ul className="space-y-2">
            <li><a href="/stalls/vdokade" className="hover:text-accent">Vdokade</a></li>
            <li><a href="/stalls/nuwan-shilpa" className="hover:text-accent">Nuwan Shilpa</a></li>
            <li><a href="/stalls/shilpa-kade" className="hover:text-accent">Shilpa Kade</a></li>
          </ul>
        </div>

        {socialArtists.length > 0 && (
          <div>
            <p className="font-medium mb-3 tracking-eyebrow uppercase text-xs text-warm-grey">
              Follow along
            </p>
            <div className="space-y-3">
              {socialArtists.map((artist) => (
                <div key={artist.id}>
                  <p className="text-xs text-warm-grey mb-1.5">{artist.name}</p>
                  <div className="flex items-center gap-3">
                    {artist.socials.map((social) => (
                      <a
                        key={social.label}
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${artist.name} on ${social.label}`}
                        title={social.label}
                        className="text-warm-grey hover:text-accent transition-colors"
                      >
                        <SocialIcon label={social.label} />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Separate from the artist social blocks above -- this is Art
            Kade's own customer-facing contact, not a per-stall channel, so
            it doesn't live inside "Follow along" or get gated by any
            artist's show_socials_in_footer flag. */}
        <div>
          <p className="font-medium mb-3 tracking-eyebrow uppercase text-xs text-warm-grey">
            Customer support
          </p>
          <ul className="space-y-2">
            <li>
              <a
                href="https://wa.me/94773891111"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent"
              >
                WhatsApp: 077 389 1111
              </a>
            </li>
            <li>
              <a href="mailto:varshadilan@gmail.com" className="hover:text-accent">
                varshadilan@gmail.com
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-6 text-center text-xs text-warm-grey">
        © {new Date().getFullYear()} Art Kade. All prints and stickers belong to their artists.
      </div>
    </footer>
  );
}
