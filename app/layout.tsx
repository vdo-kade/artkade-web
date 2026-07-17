import type { Metadata, Viewport } from "next";
import { Fraunces, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import { BagProvider } from "@/components/BagProvider";
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

export const metadata: Metadata = {
  title: "Art Kade: a curated Sri Lankan creative marketplace",
  description:
    "Kade means shop. Art Kade is where Vdokade, Nuwan Shilpa and future artists release limited-drop prints, stickers and merch.",
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
      </body>
    </html>
  );
}
