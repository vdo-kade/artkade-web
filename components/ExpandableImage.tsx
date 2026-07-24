"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

export type ExpandableImageItem = { src: string; alt: string };

// Source art has inconsistent headroom -- some designs have empty padding
// baked into the PNG, some are tight crops -- so a fixed-aspect object-cover
// frame cuts real content off on some and not others. The thumbnail here is
// always shown at its own natural aspect ratio (w-full h-auto, never
// object-cover); "frameClassName" only controls the polaroid chrome
// (background/border/padding) around it, never the crop.
//
// The 1200x1500 width/height passed to next/image below is a placeholder
// intrinsic size, not each image's real one -- every product/magazine photo
// has its own real (and varying) aspect ratio, and next/image requires a
// concrete width+height (or `fill`) up front. Per the CSS/HTML spec, an
// <img> with both a CSS width AND height of "auto" (thumbnail: w-full
// h-auto; lightbox: w-auto h-auto) ignores the width/height attributes for
// layout entirely and sizes itself from the actual loaded bitmap once it
// arrives -- so the placeholder ratio never causes stretching or cropping,
// it only feeds next/image's srcset math (via `sizes`) for which
// resolution to request.
//
// `images` takes an array so a caller with more than one image/design gets
// a swipeable/arrow slideshow in the lightbox for free -- today every
// product and magazine post has exactly one image_url in the DB, so every
// call site passes a single-item array, but the component itself doesn't
// assume that.
export default function ExpandableImage({
  images,
  className,
  frameClassName,
  placeholder,
  sizes = "(min-width: 1024px) 260px, (min-width: 640px) 45vw, 90vw",
}: {
  images: ExpandableImageItem[];
  className?: string;
  frameClassName?: string;
  placeholder?: ReactNode;
  sizes?: string;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % images.length);
      else if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + images.length) % images.length);
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, images.length]);

  if (images.length === 0) {
    return <div className={frameClassName}>{placeholder}</div>;
  }

  function next(e?: { stopPropagation: () => void }) {
    e?.stopPropagation();
    setIndex((i) => (i + 1) % images.length);
  }

  function prev(e?: { stopPropagation: () => void }) {
    e?.stopPropagation();
    setIndex((i) => (i - 1 + images.length) % images.length);
  }

  // Same tap-to-open / swipe-to-navigate handling drives both mobile and
  // desktop -- there's no separate hover-only interaction.
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || images.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) (dx < 0 ? next : prev)();
    touchStartX.current = null;
  }

  return (
    <>
      <div className={`relative w-full ${frameClassName ?? ""}`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`View ${images[index].alt} full size`}
          className="block w-full text-left cursor-zoom-in"
        >
          <Image
            src={images[index].src}
            alt={images[index].alt}
            width={1200}
            height={1500}
            sizes={sizes}
            className={`block w-full h-auto ${className ?? ""}`}
          />
        </button>

        {/* Corner thumbnail strip -- Amazon/Daraz-style gallery indicator so
            a multi-photo product/post is visibly a gallery before anyone
            opens the lightbox, and lets them jump straight to an image
            without it. Only worth showing once there's an actual choice to
            make; single-image callers (every ProductCard/MagazineCard today)
            never hit this branch. */}
        {images.length > 1 && (
          <div className="absolute bottom-2 right-2 flex gap-1 bg-white/90 p-1">
            {images.map((img, i) => (
              <button
                key={img.src + i}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIndex(i);
                }}
                aria-label={`View image ${i + 1} of ${images.length}`}
                aria-current={i === index}
                className={`relative w-8 h-8 shrink-0 overflow-hidden border ${
                  i === index ? "border-ink" : "border-line/70 opacity-70 hover:opacity-100"
                } transition-opacity`}
              >
                <Image src={img.src} alt="" fill sizes="32px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {open &&
        createPortal(
          // Rendered into document.body rather than in place: an ancestor
          // card has a CSS transform (the polaroid tilt), and any
          // transform/filter/perspective on an ancestor turns it into the
          // containing block for a `position: fixed` descendant -- so
          // without the portal this "fullscreen" overlay would actually be
          // fixed to that small rotated card instead of the viewport.
          <div
            data-testid="image-lightbox"
            className="fixed inset-0 z-[100] bg-ink/90 flex items-center justify-center p-4 sm:p-8"
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              // top-[calc(...)] adds env(safe-area-inset-top) on top of the
              // usual offset -- this is a portalled fixed-inset-0 overlay,
              // so on a notch/Dynamic Island phone (app/layout.tsx sets
              // viewportFit: "cover") an unpadded top-4 would sit right
              // under/behind the notch instead of clear of it.
              className="absolute top-[calc(env(safe-area-inset-top)_+_1rem)] right-4 sm:top-[calc(env(safe-area-inset-top)_+_1.5rem)] sm:right-6 text-white/80 hover:text-white text-3xl leading-none w-10 h-10 flex items-center justify-center"
            >
              &times;
            </button>

            {images.length > 1 && (
              <button
                type="button"
                onClick={prev}
                aria-label="Previous image"
                className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-4xl w-10 h-10 flex items-center justify-center"
              >
                &#8249;
              </button>
            )}

            <Image
              src={images[index].src}
              alt={images[index].alt}
              width={1200}
              height={1500}
              sizes="90vw"
              className="max-w-[90vw] max-h-[85vh] w-auto h-auto object-contain select-none"
              onClick={(e) => e.stopPropagation()}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            />

            {images.length > 1 && (
              <button
                type="button"
                onClick={next}
                aria-label="Next image"
                className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 text-white/80 hover:text-white text-4xl w-10 h-10 flex items-center justify-center"
              >
                &#8250;
              </button>
            )}

            {images.length > 1 && (
              <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                {images.map((img, i) => (
                  <button
                    type="button"
                    key={img.src + i}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIndex(i);
                    }}
                    aria-label={`Go to image ${i + 1}`}
                    className={`w-2 h-2 rounded-full ${i === index ? "bg-white" : "bg-white/40"}`}
                  />
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
