// Shared between Header.tsx (small header mark) and the homepage hero
// (large brand moment) so both point at the same Supabase Storage assets.
// WebP, resized to 1200px wide -- the largest real slot this renders into
// is the homepage hero at up to 501px (sizes), so 1200 covers >2x retina
// with room to spare. Was a 1522x478 PNG served raw on every page (next/
// image's own optimizer used to shrink/convert it in front of visitors;
// see next.config.js's unoptimized:true and the 2026-08-15 outage that
// caused it -- with the optimizer gone, whatever's in Storage is now the
// literal payload, so it has to already be sized/compressed correctly).
export const LOGO_URL =
  "https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/Site_assets/Logo%20on%20v2%20trans.webp";

// The short "AX" mark (same asset used for the favicon) -- used in the
// header now that the logo sits directly on cream instead of an ink plate.
// WebP, resized to 200px wide against a real render size of 48px (Header's
// sizes="48px") -- same reasoning as LOGO_URL above.
export const SHORT_LOGO_URL =
  "https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/Site_assets/Logo%20Short%20v2%20on%20trans.webp";

// Open Graph share image (app/layout.tsx's metadata) -- a static 1200x630
// render of the same cream background as the homepage hero, generated via
// a real browser rather than reimplemented in a different image pipeline.
// Static, not per-page dynamic: nothing here changes per product/stall, so
// one shared image covers every link.
// Stays PNG, not WebP: this is the one image on the site next/image never
// touches (fed straight to <meta property="og:image">, fetched by each
// platform's own scraper, not the browser) -- Slack and Discord in
// particular are known to mishandle WebP og:images, and there's no Accept
// negotiation possible with a scraper the way there is with a browser.
// Palette-quantized PNG instead: 118KB vs the original 322KB truecolor
// PNG, same file, same URL (compressed in place in Storage, so this
// constant didn't need to change) -- confirmed no visible banding on the
// soft drop-shadow despite the reduced color count.
export const OG_IMAGE_URL =
  "https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/Site_assets/og-image.png";

// www is the canonical host -- artkade.space (apex) 308-redirects here at
// the DNS/Vercel domain level. Every absolute URL this app emits
// (sitemap, robots' sitemap link, og:url, canonical tags, email links)
// needs to already be on the canonical host, or crawlers/scrapers spend an
// extra hop resolving a redirect on every single one.
export const SITE_URL = "https://www.artkade.space";

// v2 artwork carries its own baked-in black outline around every glyph
// (unlike the v1 assets, whose neutral triangle-eye/wordmark elements were
// pure white -- ~1.1:1 against this site's cream (#F5EFE4) and needed a
// hard-edged stacked-drop-shadow CSS outline just to read against the
// background). That outline is now part of the art itself, so the only
// thing this filter needs to add is ordinary elevation -- one soft, low-
// opacity shadow, applied at the same value regardless of the logo's
// rendered size (no more small/large split for stroke-width scaling).
export const LOGO_SHADOW_FILTER = "drop-shadow(0 4px 10px rgba(28,23,18,0.18))";
