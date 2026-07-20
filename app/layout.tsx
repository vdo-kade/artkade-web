import type { Metadata, Viewport } from "next";
import { Fraunces, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { BagProvider } from "@/components/BagProvider";
import { OG_IMAGE_URL, SITE_URL } from "@/lib/brand";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  weight: ["400", "500", "600"],
});
const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
  weight: ["400", "500", "600"],
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500"],
});

const SITE_TITLE = "Art Kade: a curated Sri Lankan creative marketplace";
const SITE_DESCRIPTION =
  "Kade means shop. Art Kade is where Vdokade, Nuwan Shilpa and future artists release limited-drop prints, stickers and merch.";

// Site-wide default -- every page inherits this unless it sets its own
// `metadata` export (none currently do). This is also what a link-preview
// crawler (WhatsApp, Facebook, etc) sees even for a bare "/" link: the
// site-wide gate (middleware.ts) redirects an anonymous request to /gate,
// but /gate is wrapped by this same root layout, so the branded OG tags
// still render there rather than the crawler landing on nothing.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Art Kade",
    images: [{ url: OG_IMAGE_URL, width: 1200, height: 630, alt: "Art Kade" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_URL],
  },
};

// viewportFit: "cover" is what makes the page extend the full physical
// screen on notch/Dynamic Island phones instead of stopping short of it --
// without it, the sticky header's cream background stops at the safe-area
// boundary, leaving the true top strip (behind the status bar/notch)
// showing through as unstyled browser chrome instead of cream, which reads
// as the header "not fully fitting the top of the screen". Header.tsx and
// ExpandableImage.tsx's lightbox close button both pad for
// env(safe-area-inset-*) so their own content still clears the notch now
// that the page extends under it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${fraunces.variable} ${workSans.variable} ${plexMono.variable} font-body bg-cream text-ink`}
      >
        <BagProvider>{children}</BagProvider>
        {/* Vercel's free Web Analytics -- no-cost pageview/visitor counts,
            not the paid "Analytics Plus" tier. Still needs "Enable" clicked
            once in the Vercel dashboard's Project -> Analytics tab; this
            script is a no-op until that's done. */}
        <Analytics />
      </body>
    </html>
  );
}
