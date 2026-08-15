import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase-server";
import { RESPONSIVE_IMAGE_WIDTHS } from "@/lib/mediaWidths";

// Public catalogue photos are routed through here rather than straight at
// Supabase Storage's public URL -- the same class of gap already fixed for
// freebie downloads (app/api/freebie/[id]/route.ts) and the stall hero
// banner: something reaching the browser that was never meant to be
// directly reachable. Two things this does that a plain reverse-proxy
// wouldn't:
//
// 1. Keeps the raw Storage URL out of the DOM. next/image's own
//    /_next/image?url=... exposes whatever `src` it's given verbatim in
//    that query param, so pointing it at this route instead of Supabase
//    means a page-source read only ever reveals this route's own id, not a
//    permanent, unauthenticated, print-quality master file.
//
// 2. Caps resolution at the pipeline level, not just next.config.js's
//    deviceSizes. A real product photo measured 1697x2400 (~410dpi at A6,
//    ~290dpi at A5 -- both printable), and deviceSizes was never
//    customized (defaults run up to 3840), so the site was already
//    legitimately serving full native resolution through the ordinary
//    lightbox. Trimming deviceSizes would cap that too, but it's a global
//    next.config.js setting that also governs the stall hero banner and
//    magazine images -- resizing here instead caps only what this route
//    serves. MAX_DIMENSION lands a print at ~85dpi (A3) to ~170dpi (A5) --
//    visibly poor to print, still sharp at 2x on any realistic on-screen
//    viewing size. The original stays untouched in Storage; this only caps
//    what leaves this route.
const MAX_DIMENSION = 1400;

// The only widths this route will ever resize to on request (via ?w=) --
// see lib/mediaWidths.ts, shared with components/SelfHealingImage.tsx so
// the two can't drift apart. Fixed, small whitelist rather than accepting
// arbitrary values for two reasons: an arbitrary ?w= would fragment this
// route's otherwise-simple "one immutable file per id (times format)"
// cache story into a combinatorial "per id, per format, per exact pixel
// width" one, and without a cap, ?w= would itself become a way to ask for
// more than MAX_DIMENSION -- resolveTargetWidth below still clamps
// regardless, but not accepting the value in the first place is the
// simpler guarantee.
function resolveTargetWidth(param: string | null): number {
  if (param) {
    const parsed = Number(param);
    if ((RESPONSIVE_IMAGE_WIDTHS as readonly number[]).includes(parsed)) return parsed;
  }
  return MAX_DIMENSION;
}

// Vercel's own Image Optimization (next/image's /_next/image) is what used
// to do format conversion in front of this route -- disabled site-wide
// (next.config.js's unoptimized:true) after it hit its account-level quota
// and started 402/404ing every image on 2026-08-15. With it gone, this
// route is the only place left that can pick a smaller format, so it does
// its own content negotiation on the Accept header rather than hardcoding
// WebP -- a client that never sends "image/webp" (old browser, curl, a
// bot) still gets a real image back instead of a format it can't decode.
// AVIF isn't offered: meaningfully slower to encode per request for a
// marginal size win over WebP at this quality, and every WebP-capable
// client base already overlaps almost entirely with AVIF-capable ones.
const WEBP_QUALITY = 82;
const JPEG_QUALITY = 82;

function pickFormat(acceptHeader: string, hasAlpha: boolean): "webp" | "jpeg" | "png" {
  if (acceptHeader.includes("image/webp")) return "webp";
  // JPEG can't represent transparency at all (no alpha channel) -- falling
  // back to it for an alpha-bearing source (stickers, logos, anything with
  // a transparent background) would flatten it onto an opaque fill and
  // visibly break the image, not just shrink it. PNG is the safe fallback
  // there; only non-alpha sources fall back to JPEG.
  return hasAlpha ? "png" : "jpeg";
}

// Safe to cache this aggressively (Cache-Control below): product_images.url
// is immutable for a given row id -- every product_images mutation in
// app/vendor/actions.ts either inserts a new row or deletes one outright,
// never updates `url` in place (confirmed against every call site that
// touches this table). This is NOT true of products.image_url itself (it's
// reassigned whenever the vendor deletes/reorders the first gallery photo),
// which is exactly why this route is keyed off product_images.id and not
// the product's own id -- see lib/catalogue.ts's mediaPath.
//
// product_images has no is_active of its own and an unconditional public
// read policy (supabase/schema.sql), written on the assumption that this
// table is only ever reached as a nested embed of an already-active-
// filtered products query -- true for the public product/card queries, but
// not for this route, which looks rows up directly by id. Joining through
// to products/artists' own is_active here keeps a delisted product's photo
// from staying reachable forever through this route after the raw
// Storage URL would otherwise be the only thing keeping it alive.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: image } = await supabase
    .from("product_images")
    .select("url, products!inner(is_active, artists!inner(is_active))")
    .eq("id", params.id)
    .eq("products.is_active", true)
    .eq("products.artists.is_active", true)
    .maybeSingle<{ url: string }>();
  if (!image) return new NextResponse("Not found", { status: 404 });

  const upstream = await fetch(image.url);
  if (!upstream.ok || !upstream.body) {
    return new NextResponse("Failed to fetch image", { status: 502 });
  }

  const original = Buffer.from(await upstream.arrayBuffer());
  const originalContentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const targetWidth = resolveTargetWidth(req.nextUrl.searchParams.get("w"));

  let body: Buffer;
  let contentType: string;
  try {
    const originalMeta = await sharp(original).metadata();
    const format = pickFormat(req.headers.get("accept") ?? "", originalMeta.hasAlpha ?? false);

    // height is always the MAX_DIMENSION constant, never targetWidth --
    // fit:"inside" fits the source within a width x height box, so
    // setting height to whatever width was requested would make a
    // ?w=200 request on a portrait source come back short of 200px
    // *wide* (the box would cap height at 200 first, on a source where
    // width is the smaller dimension). Decoupling them means the
    // requested width is always what's honored for a normal-ish image
    // (matching the "200w" srcset descriptor components/
    // SelfHealingImage.tsx declares for it), while MAX_DIMENSION still
    // catches the one case that actually needs a height cap: an extreme
    // portrait source at the *default* (no ?w=) request, where this
    // reduces to exactly the original single-cap behavior since
    // targetWidth itself defaults to MAX_DIMENSION.
    let pipeline = sharp(original).resize({
      width: targetWidth,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
    pipeline =
      format === "webp"
        ? pipeline.webp({ quality: WEBP_QUALITY })
        : format === "jpeg"
          ? pipeline.jpeg({ quality: JPEG_QUALITY })
          : pipeline.png({ compressionLevel: 9 });

    const { data: encoded, info } = await pipeline.toBuffer({ resolveWithObject: true });

    // The bug this guards against: a source already at/under MAX_DIMENSION
    // isn't resized at all (fit:"inside" + withoutEnlargement is a no-op on
    // it), so the only thing that happened is a re-encode -- and sharp's
    // default PNG encoder produces a larger file than some already-
    // optimized source PNGs (confirmed live: a 1.66MB indexed-palette
    // master came back as a 2.4MB truecolor+alpha re-encode). Re-encoding
    // only ever has a chance of being smaller; it should never ship a
    // bigger response than doing nothing would have. This check only
    // applies when no real downscale happened -- a genuinely oversized
    // master (the print-quality masters this route exists to cap) always
    // ships the resized/re-encoded version regardless of relative byte
    // count, because serving the untouched original there would leak
    // exactly the full-resolution file this route is meant to prevent.
    const wasResized = info.width !== originalMeta.width || info.height !== originalMeta.height;
    if (!wasResized && encoded.length >= original.length) {
      body = original;
      contentType = originalContentType;
    } else {
      body = encoded;
      contentType = `image/${format}`;
    }
  } catch (err) {
    console.error("Failed to resize product image:", err);
    return new NextResponse("Failed to process image", { status: 502 });
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      // The response body now depends on the request's Accept header
      // (webp vs. jpeg/png), not just the URL -- Vary tells any cache
      // sitting in front of a shared client (a corporate proxy, another
      // CDN) to key on that too. Doesn't multiply anything stored on our
      // side: this route has no server-side cache of its own keyed by
      // URL, only the year-long immutable Cache-Control above, which is
      // the requesting browser's own per-client cache -- Vary just keeps
      // that browser's cache honest if its own Accept header ever changes
      // (e.g. a browser update that adds WebP support), it doesn't create
      // new storage anywhere.
      Vary: "Accept",
    },
  });
}
