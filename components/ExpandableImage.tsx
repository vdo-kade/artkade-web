"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type ExpandableImageItem = { src: string; alt: string };

// Source art has inconsistent headroom -- some designs have empty padding
// baked into the PNG, some are tight crops -- so a fixed-aspect object-cover
// frame cuts real content off on some and not others. The thumbnail here is
// always shown at its own natural aspect ratio (w-full h-auto, never
// object-cover); "frameClassName" only controls the polaroid chrome
// (background/border/padding) around it, never the crop.
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
}: {
  images: ExpandableImageItem[];
  className?: string;
  frameClassName?: string;
  placeholder?: ReactNode;
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

  function openAt(i: number) {
    setIndex(i);
    setOpen(true);
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
      <button
        type="button"
        onClick={() => openAt(0)}
        aria-label={`View ${images[0].alt} full size`}
        className={`block w-full text-left cursor-zoom-in ${frameClassName ?? ""}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[0].src} alt={images[0].alt} loading="lazy" className={`block w-full h-auto ${className ?? ""}`} />
      </button>

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

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[index].src}
              alt={images[index].alt}
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
