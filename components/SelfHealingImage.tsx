"use client";

import { useRef, useState } from "react";
import Image, { type ImageProps } from "next/image";
import { RESPONSIVE_IMAGE_WIDTHS } from "@/lib/mediaWidths";

// Every catalogue/magazine image sits behind next.config.js's week-long
// minimumCacheTTL, deliberately -- Supabase Storage always serves
// Cache-Control: no-cache, so shortening that TTL to make bad responses
// less "sticky" would just mean every image gets re-fetched from Supabase
// (and billed as Cached Egress, already over the free-tier cap) far more
// often. See docs/free-tier-checklist.md.
//
// The actual failure this is guarding against ("New World" rendering as a
// broken-image placeholder in production) was a truncated/corrupt
// response that got cached with a 200 status -- once that happens, the
// browser considers the entry fresh for the full week and a normal reload
// never re-requests it. Confirmed live: the underlying Storage file and
// every optimized variant were completely intact; only the one poisoned
// browser cache entry was bad.
//
// Rather than shorten the cache window for every image, this component
// detects that one failure locally and retries exactly once with a
// cache-busting query param appended to the source URL -- a different
// `url=` value is a different cache key at both the browser and Vercel's
// edge, so the retry skips straight past the poisoned entry without
// touching anyone else's cache. A genuinely missing file still fails the
// retry and is left alone (no loop, no repeated re-fetching).
function withCacheBust(src: string) {
  return src + (src.includes("?") ? "&" : "?") + "retry=1";
}

// app/api/media/image/[id]/route.ts is the one image source on this site
// that can actually resize itself (?w=, whitelisted to
// RESPONSIVE_IMAGE_WIDTHS -- see lib/mediaWidths.ts). Everything else
// (the stall hero banner, site logos, the OG image) is a raw Storage URL
// with nothing behind it to generate a smaller variant on request, so
// there's no srcset worth building for those -- they fall through to the
// plain <Image> branch below unchanged.
//
// That branch can't just be "the same but with a computed srcSet prop":
// next/image doesn't accept one. Its own srcset generation goes through
// next.config.js's images.unoptimized:true (set globally after Vercel's
// own Image Optimization quota caused the 2026-08-15 outage -- see that
// file's comment), and Next 14 hard-codes that global flag to win over
// any per-instance override (node_modules/next/dist/shared/lib/
// get-img-props.js: `if (config.unoptimized) { unoptimized = true }`,
// unconditionally, after reading the prop) -- confirmed by testing
// against a real build, not assumed. There's no supported way to opt one
// component back into next/image's own responsive-srcset machinery while
// that global flag is on, short of touching it (which would put every
// other <Image> on the site back through Vercel's optimizer -- the exact
// thing that caused the outage -- and this codebase has ten other files
// importing next/image directly that would all need re-auditing for
// that). Rendering a plain <img> here instead, with a hand-built srcSet
// pointed at our own proxy, gets real responsive images without touching
// any of that.
const MEDIA_PROXY_PREFIX = "/api/media/image/";

function buildSrcSet(src: string): string {
  const sep = src.includes("?") ? "&" : "?";
  return RESPONSIVE_IMAGE_WIDTHS.map((w) => `${src}${sep}w=${w} ${w}w`).join(", ");
}

export default function SelfHealingImage({ src, onError, onLoad, ...props }: ImageProps) {
  const [busted, setBusted] = useState(false);
  const retried = useRef(false);

  // StaticImageData (a build-time local import) can't be corrupted by a
  // stale HTTP cache entry the way a remote Supabase URL can -- nothing to
  // heal, so only ever retry when src is the plain remote-URL string every
  // real call site actually passes.
  function recoverOnce() {
    if (retried.current || typeof src !== "string") return false;
    retried.current = true;
    setBusted(true);
    return true;
  }

  const effectiveSrc = busted && typeof src === "string" ? withCacheBust(src) : src;

  if (typeof effectiveSrc === "string" && effectiveSrc.startsWith(MEDIA_PROXY_PREFIX)) {
    const { alt, width, height, fill, sizes, priority, className, style, draggable, onDragStart, onContextMenu, onClick, onTouchStart, onTouchEnd } = props;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- deliberate,
      // see the comment above: next/image can't emit a real srcset here.
      <img
        src={effectiveSrc}
        srcSet={buildSrcSet(effectiveSrc)}
        sizes={sizes}
        alt={alt}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className={className}
        style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style}
        draggable={draggable}
        onDragStart={onDragStart}
        onContextMenu={onContextMenu}
        onClick={onClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onError={(e) => {
          if (!recoverOnce()) onError?.(e);
        }}
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth === 0 && recoverOnce()) return;
          onLoad?.(e);
        }}
      />
    );
  }

  return (
    <Image
      {...props}
      src={effectiveSrc}
      onError={(e) => {
        if (!recoverOnce()) onError?.(e);
      }}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth === 0 && recoverOnce()) return;
        onLoad?.(e);
      }}
    />
  );
}
