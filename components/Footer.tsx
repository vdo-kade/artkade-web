"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase";
import { SHORT_LOGO_URL, LOGO_OUTLINE_FILTER_SMALL } from "@/lib/brand";

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
          {/* Same transparent-on-cream + hard-edged-outline treatment as
              the header's small mark (see components/Header.tsx) -- the
              footer sits on the same cream background, so it reuses the
              "small" filter rather than the hero's heavier one. */}
          <Image
            src={SHORT_LOGO_URL}
            alt="Art Kade"
            width={812}
            height={712}
            sizes="48px"
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
            <div className="space-y-4">
              {socialArtists.map((artist) => (
                <div key={artist.id}>
                  <p className="text-xs text-warm-grey mb-1">{artist.name}</p>
                  <ul className="space-y-1">
                    {artist.socials.map((social) => (
                      <li key={social.label}>
                        <a
                          href={social.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-accent"
                        >
                          {social.label}
                        </a>
                      </li>
                    ))}
                  </ul>
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
