"use client";

import { useEffect, useRef, useState } from "react";

export type WheelImage = {
  id: string;
  imageUrl: string;
  label: string;
};

/**
 * Pinned to the right edge of the viewport (desktop only -- simplifies away
 * on mobile per the PRD's "animations gracefully simplify on mobile" rule).
 * As the page scrolls, the wheel rotates through `images`: the item nearest
 * the centre is enlarged and fully opaque, neighbours shrink and fade,
 * evoking an old iPod click-wheel scrolling through album art.
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
    <div
      aria-hidden
      className="hidden lg:flex flex-col items-center gap-4 fixed right-8 top-1/2 -translate-y-1/2 z-30 pointer-events-none"
    >
      {images.map((img, i) => {
        const distance = Math.abs(i - activeIndex);
        const scale = distance === 0 ? 1 : distance === 1 ? 0.72 : 0.5;
        const opacity = distance === 0 ? 1 : distance === 1 ? 0.55 : 0.25;
        return (
          <div
            key={img.id}
            className="rounded-full overflow-hidden border-2 border-white shadow-md transition-all duration-300 ease-out"
            style={{
              width: 104 * scale,
              height: 104 * scale,
              opacity,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.imageUrl} alt={img.label} className="w-full h-full object-cover" />
          </div>
        );
      })}
    </div>
  );
}
