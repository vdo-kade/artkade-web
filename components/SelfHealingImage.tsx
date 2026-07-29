"use client";

import { useRef, useState } from "react";
import Image, { type ImageProps } from "next/image";

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
