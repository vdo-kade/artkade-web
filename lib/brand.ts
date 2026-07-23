// Shared between Header.tsx (small header mark) and the homepage hero
// (large brand moment) so both point at the same Supabase Storage assets.
export const LOGO_URL =
  "https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/Site_assets/Logo%20on%20v2%20trans.png";

// The short "AX" mark (same asset used for the favicon) -- used in the
// header now that the logo sits directly on cream instead of an ink plate.
export const SHORT_LOGO_URL =
  "https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/Site_assets/Logo%20Short%20v2%20on%20trans.png";

// Open Graph share image (app/layout.tsx's metadata) -- a static 1200x630
// render of the same cream background as the homepage hero, generated via
// a real browser rather than reimplemented in a different image pipeline.
// Static, not per-page dynamic: nothing here changes per product/stall, so
// one shared image covers every link.
export const OG_IMAGE_URL =
  "https://knetfofbdjsthqienegg.supabase.co/storage/v1/object/public/media/Site_assets/og-image.png";

export const SITE_URL = "https://artkade.space";

// v2 artwork carries its own baked-in black outline around every glyph
// (unlike the v1 assets, whose neutral triangle-eye/wordmark elements were
// pure white -- ~1.1:1 against this site's cream (#F5EFE4) and needed a
// hard-edged stacked-drop-shadow CSS outline just to read against the
// background). That outline is now part of the art itself, so the only
// thing this filter needs to add is ordinary elevation -- one soft, low-
// opacity shadow, applied at the same value regardless of the logo's
// rendered size (no more small/large split for stroke-width scaling).
export const LOGO_SHADOW_FILTER = "drop-shadow(0 4px 10px rgba(28,23,18,0.18))";
