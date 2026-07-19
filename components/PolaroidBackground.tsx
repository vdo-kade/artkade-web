"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export type PolaroidImage = { src: string; alt: string };

type Slot = {
  top: string;
  left: string;
  rotate: string;
  width: string;
  // Progressively fewer slots on smaller viewports so the scatter stays
  // decorative rather than cluttered -- not hidden outright on mobile,
  // since the task wants this verified there too, just thinned out.
  className?: string;
};

const SLOTS: Slot[] = [
  { top: "6%", left: "4%", rotate: "-8deg", width: "9rem" },
  { top: "10%", left: "78%", rotate: "6deg", width: "8rem" },
  { top: "60%", left: "3%", rotate: "5deg", width: "7.5rem", className: "hidden sm:block" },
  { top: "66%", left: "78%", rotate: "-6deg", width: "8.5rem" },
  { top: "34%", left: "88%", rotate: "9deg", width: "6.5rem", className: "hidden md:block" },
  { top: "82%", left: "42%", rotate: "-4deg", width: "7rem", className: "hidden sm:block" },
  { top: "4%", left: "44%", rotate: "3deg", width: "6rem", className: "hidden lg:block" },
];

const IMAGES_PER_SLOT = 3;
const CYCLE_MS = 5000;
const TRANSITION_MS = 2200;

// Decorative, aria-hidden, pointer-events-none scatter of real catalogue
// images behind the gate form. Each slot's position/rotation/size is a
// fixed hand-picked value (not randomly generated at render time) so
// server and client markup always match -- true randomness here would
// either need to run client-only (a flash of unstyled/repositioned
// content on mount) or risk a hydration mismatch for no real benefit.
export default function PolaroidBackground({ images }: { images: PolaroidImage[] }) {
  if (images.length === 0) return null;

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
      {SLOTS.map((slot, i) => {
        const slotImages = Array.from(
          { length: Math.min(IMAGES_PER_SLOT, images.length) },
          (_, k) => images[(i * IMAGES_PER_SLOT + k) % images.length]
        );
        return <PolaroidSlot key={i} slot={slot} images={slotImages} startDelayMs={i * 900} />;
      })}
    </div>
  );
}

function PolaroidSlot({
  slot,
  images,
  startDelayMs,
}: {
  slot: Slot;
  images: PolaroidImage[];
  startDelayMs: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length < 2) return;
    // Staggered per-slot start (startDelayMs, applied once) so slots don't
    // all cross-fade in lockstep -- reads as a gentle, uneven drift rather
    // than a single synchronized flicker across the whole background. A
    // steady CYCLE_MS interval takes over after that first delayed swap;
    // startDelayMs is deliberately NOT in the dependency array's effect
    // body a second time, or every subsequent cycle would inherit the
    // stagger too instead of just the first one.
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const startTimeout = setTimeout(() => {
      setIndex((i) => (i + 1) % images.length);
      intervalId = setInterval(() => {
        setIndex((i) => (i + 1) % images.length);
      }, CYCLE_MS);
    }, startDelayMs + CYCLE_MS);
    return () => {
      clearTimeout(startTimeout);
      if (intervalId) clearInterval(intervalId);
    };
  }, [images.length, startDelayMs]);

  return (
    <div
      className={`absolute bg-white border border-line p-1.5 pb-3 shadow-md ${slot.className ?? ""}`}
      style={{ top: slot.top, left: slot.left, width: slot.width, transform: `rotate(${slot.rotate})` }}
    >
      {/* Fixed square-ish crop, unlike ProductCard's "never crop" rule --
          this is decorative wallpaper chrome behind a form, not a shop
          listing a customer needs to evaluate, and a Polaroid photo being
          a fixed-ratio crop is the actual reference aesthetic here. */}
      <div className="relative w-full" style={{ aspectRatio: "1 / 1" }}>
        {images.map((img, i) => (
          <Image
            key={img.src}
            src={img.src}
            alt=""
            fill
            sizes="150px"
            className="object-cover ease-in-out"
            style={{
              opacity: i === index ? 1 : 0,
              filter: i === index ? "blur(0px)" : "blur(10px)",
              transitionProperty: "opacity, filter",
              transitionDuration: `${TRANSITION_MS}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
