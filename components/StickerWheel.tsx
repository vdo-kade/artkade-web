"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export type WheelImage = {
  id: string;
  imageUrl: string;
  label: string;
  // Product identity for the click-through -- this widget shares its data
  // (each active stall's current top products) with the "From the current
  // drop" section further down the same page, not view history. See
  // app/page.tsx's FEATURED_PRODUCTS/WHEEL_IMAGES.
  stallSlug: string;
  slug: string;
};

/**
 * Pinned to the right edge of the viewport (desktop only -- simplifies away
 * on mobile per the PRD's "animations gracefully simplify on mobile" rule).
 * As the page scrolls, the wheel rotates through `images`: the item nearest
 * the centre is enlarged and fully opaque, neighbours shrink and fade,
 * evoking an old iPod click-wheel scrolling through album art. Each circle
 * is a real link to that product's detail page -- no longer aria-hidden/
 * pointer-events-none now that it's an actual nav element, not decoration.
 *
 * Dashboard note: `images` should come from a "Sticker Wheel" media-library
 * selection so the artist/admin can control exactly what appears here.
 */
export default function StickerWheel({ images }: { images: WheelImage[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const ticking = useRef(false);

  useEffect(() => {
    function onScroll() {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const progress = Math.min(
          1,
          Math.max(0, window.scrollY / (document.body.scrollHeight - window.innerHeight))
        );
        setActiveIndex(Math.round(progress * (images.length - 1)));
        ticking.current = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [images.length]);

  if (images.length === 0) return null;

  return (
    <div className="hidden lg:flex flex-col items-center gap-4 fixed right-8 top-1/2 -translate-y-1/2 z-30">
      {images.map((img, i) => {
        const distance = Math.abs(i - activeIndex);
        const scale = distance === 0 ? 1 : distance === 1 ? 0.72 : 0.5;
        const opacity = distance === 0 ? 1 : distance === 1 ? 0.55 : 0.25;
        return (
          <Link
            key={img.id}
            href={`/stalls/${img.stallSlug}/products/${img.slug}`}
            aria-label={`View ${img.label}`}
            className="relative block rounded-full overflow-hidden border-2 border-white shadow-md transition-all duration-300 ease-out hover:scale-105"
            style={{
              width: 104 * scale,
              height: 104 * scale,
              opacity,
            }}
          >
            <Image src={img.imageUrl} alt={img.label} fill sizes="104px" className="object-cover" />
          </Link>
        );
      })}
    </div>
  );
}
