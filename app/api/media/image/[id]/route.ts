import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase-server";

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
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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
  let resized: Buffer;
  try {
    resized = await sharp(original)
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .toBuffer();
  } catch (err) {
    console.error("Failed to resize product image:", err);
    return new NextResponse("Failed to process image", { status: 502 });
  }

  return new NextResponse(new Uint8Array(resized), {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
