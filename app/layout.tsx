import type { Metadata, Viewport } from "next";
import { Fraunces, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { BagProvider } from "@/components/BagProvider";
import { OG_IMAGE_URL, SITE_URL } from "@/lib/brand";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

// Sets the `dark` class on <html> before the browser paints anything, so
// dark mode never has a flash-of-wrong-theme on load -- the one thing this
// feature is easiest to get visibly wrong. Has to be a real blocking
// script, not a cookie read in this Server Component: "follow system
// preference by default" means the FIRST-ever visit (no stored choice at
// all) still needs to render the right theme immediately, and only the
// client knows the OS's prefers-color-scheme -- the server has no way to
// know it. `beforeInteractive` is next/script's own mechanism for exactly
// this class of problem (runs in <head>, before hydration, before paint),
// rather than a plain <script> tag fighting Next's own script handling.
// ThemeToggle.tsx uses the same THEME_STORAGE_KEY and the same
// stored-choice-wins-else-system logic, so this is the only place that
// decides the initial theme -- the toggle just reads what it already set.
const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

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
  // suppressHydrationWarning below: the before-paint script adds/omits the
  // `dark` class on <html> before React ever hydrates, which is an
  // intentional mismatch against the server-rendered markup (the server
  // can't know the client's theme choice) -- this is the documented,
  // correct use of the prop for exactly this pattern, not a blanket
  // suppression of real hydration bugs.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      {/* No transition-colors here: it sounds like a nice touch for the
          manual toggle, but tested live it made the very first paint in
          dark mode transiently show light-mode colours (nav links
          computed as dark-on-dark for several seconds before "catching
          up" to the before-paint script's already-correct class) --
          exactly the flash this whole feature exists to avoid. Toggling
          without it is an instant cut, not a fade, but an instant
          correct cut beats an animated wrong one. */}
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
